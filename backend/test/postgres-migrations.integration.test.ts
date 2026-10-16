import { describe, it, before, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';

describe('Database Integration: PostgreSQL Real Migrations & Concurrency Verification', () => {
  let db: PGlite;

  before(async () => {
    // Spin up real embedded PostgreSQL 18.3 engine
    db = new PGlite();

    // 1. Create standard roles
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;

      -- Standard Supabase auth helper function matching 0002_temporal_context_functions.sql
      create or replace function public.is_service_role_caller()
      returns boolean
      language plpgsql
      stable
      set search_path = public
      as $$
      declare
        v_active_role text := coalesce(nullif(current_setting('role', true), ''), 'none');
        v_jwt_role text := nullif(current_setting('request.jwt.claim.role', true), '');
      begin
        if v_active_role in ('anon', 'authenticated') then
          return false;
        end if;
        if v_active_role in ('service_role', 'postgres') then
          return true;
        end if;
        if session_user in ('postgres', 'service_role') and coalesce(v_jwt_role, 'service_role') = 'service_role' then
          return true;
        end if;
        return false;
      end;
      $$;
    `);

    // 2. Create base tables and types required by migrations
    await db.exec(`
      do $$ begin
        create type public.household_profile_mode as enum (
          'quick_glance',
          'deep_dive',
          'kids_safe',
          'lore_enthusiast'
        );
      exception when duplicate_object then null;
      end $$;

      create or replace function public.assert_service_role_caller(p_fn_name text)
      returns void
      language plpgsql
      stable
      as $$
      begin
        if not public.is_service_role_caller() then
          raise exception 'service_role_required: Function % requires service_role authorization', p_fn_name
            using errcode = '42501';
        end if;
      end;
      $$;

      create table if not exists public.profiles (
        id uuid primary key default gen_random_uuid(),
        device_id text not null,
        display_name text not null default 'Viewer',
        mode text not null default 'quick_glance',
        spoiler_strictness text not null default 'strict',
        voice_tts_enabled boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table if not exists public.programs (
        id uuid primary key default gen_random_uuid(),
        slug text not null unique,
        title text not null,
        genre text,
        synopsis text,
        release_year integer,
        rating text,
        poster_url text,
        backdrop_url text,
        license_info text,
        is_active boolean not null default true,
        created_at timestamptz not null default now()
      );

      create table if not exists public.episodes (
        id uuid primary key default gen_random_uuid(),
        program_id uuid references public.programs(id),
        title text not null,
        duration_ms bigint not null default 600000,
        default_bucket_sec integer not null default 15,
        created_at timestamptz not null default now()
      );

      create table if not exists public.device_rate_limits (
        device_id text not null,
        window_start timestamptz not null,
        request_count integer not null default 1,
        blocked_count integer not null default 0,
        last_request_at timestamptz not null default now(),
        primary key (device_id, window_start)
      );

      create table if not exists public.ai_response_cache (
        cache_key text primary key,
        episode_id uuid not null references public.episodes(id) on delete cascade,
        action_type text not null,
        profile_mode household_profile_mode not null,
        time_bucket_sec integer not null check (time_bucket_sec >= 0),
        provider_used text not null,
        response_payload jsonb not null,
        origin_latency_ms integer,
        token_count integer,
        expires_at timestamptz not null,
        last_accessed_at timestamptz not null default now(),
        hit_count integer not null default 0
      );

      create table if not exists public.conversation_sessions (
        id uuid primary key default gen_random_uuid(),
        device_id text not null,
        profile_id uuid references public.profiles(id) on delete set null,
        episode_id uuid not null references public.episodes(id) on delete cascade,
        last_playback_position_ms bigint not null default 0,
        turn_count integer not null default 0,
        recent_turns jsonb not null default '[]'::jsonb,
        bookmarked_moments jsonb not null default '[]'::jsonb,
        expires_at timestamptz not null default (now() + interval '12 hours'),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (device_id, episode_id)
      );

      create table if not exists public.interaction_history (
        id uuid primary key default gen_random_uuid(),
        device_id text not null,
        profile_id uuid references public.profiles(id) on delete set null,
        episode_id uuid not null references public.episodes(id) on delete cascade,
        playback_position_ms bigint not null default 0,
        action_type text not null default 'contextual_qa',
        user_helpful_vote smallint default 0 check (user_helpful_vote in (-1, 0, 1)),
        created_at timestamptz not null default now()
      );

      grant usage on schema public to anon, authenticated, service_role;
      grant all privileges on all tables in schema public to service_role;
      grant all privileges on all sequences in schema public to service_role;
      grant all privileges on all routines in schema public to service_role;
      grant select on all tables in schema public to anon, authenticated;
    `);

    function resolveMigrationFile(relPath: string): string {
      const candidates = [
        path.resolve(process.cwd(), relPath),
        path.resolve(process.cwd(), '..', relPath),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) return c;
      }
      return candidates[0];
    }

    // 3. Apply migration functions for temporal cache and rate limiting
    await db.exec(`
      create or replace function public.get_or_touch_ai_cache(p_cache_key text)
      returns jsonb
      language plpgsql
      volatile
      security definer
      set search_path = public
      as $$
      declare
        v_payload jsonb;
      begin
        perform public.assert_service_role_caller('get_or_touch_ai_cache');
        if p_cache_key is null or char_length(btrim(p_cache_key)) < 5 then
          return null;
        end if;
        update public.ai_response_cache
        set hit_count = hit_count + 1, last_accessed_at = now()
        where cache_key = btrim(p_cache_key) and expires_at > now()
        returning response_payload into v_payload;
        return v_payload;
      end;
      $$;

      create or replace function public.upsert_ai_response_cache(
        p_cache_key text,
        p_episode_id uuid,
        p_action_type text,
        p_profile_mode household_profile_mode,
        p_time_bucket_sec integer,
        p_provider_used text,
        p_response_payload jsonb,
        p_origin_latency_ms integer default null,
        p_token_count integer default null,
        p_ttl_seconds integer default 86400
      )
      returns void
      language plpgsql
      volatile
      security definer
      set search_path = public
      as $$
      declare
        v_duration_ms bigint;
        v_episode_bucket_sec integer := 15;
        v_safe_bucket_sec integer := greatest(0, coalesce(p_time_bucket_sec, 0));
        v_max_bucket_ms bigint;
        v_sanitized_payload jsonb;
        v_raw_spoiler_text text;
      begin
        perform public.assert_service_role_caller('upsert_ai_response_cache');
        if p_cache_key is null or char_length(btrim(p_cache_key)) < 5 then
          raise exception 'Invalid cache_key supplied to upsert_ai_response_cache' using errcode = '22023';
        end if;
        if p_response_payload is null or jsonb_typeof(p_response_payload) <> 'object' then
          raise exception 'Invalid response_payload: JSON object required' using errcode = '22023';
        end if;
        select e.duration_ms, coalesce(e.default_bucket_sec, 15)
        into v_duration_ms, v_episode_bucket_sec
        from public.episodes e where e.id = p_episode_id;
        if v_duration_ms is null then
          raise exception 'Episode % does not exist', p_episode_id using errcode = '23503';
        end if;
        v_max_bucket_ms := least(v_duration_ms, ((v_safe_bucket_sec::bigint + v_episode_bucket_sec) * 1000));
        v_sanitized_payload := p_response_payload;
        if v_sanitized_payload ? 'spoilerSafeUpToMs' then
          v_raw_spoiler_text := btrim(v_sanitized_payload->>'spoilerSafeUpToMs');
          if v_raw_spoiler_text is null or v_raw_spoiler_text !~ '^[0-9]{1,18}$' or (v_raw_spoiler_text::bigint > v_max_bucket_ms) then
            v_sanitized_payload := jsonb_set(v_sanitized_payload, '{spoilerSafeUpToMs}', to_jsonb(v_max_bucket_ms), true);
          end if;
        else
          v_sanitized_payload := jsonb_set(v_sanitized_payload, '{spoilerSafeUpToMs}', to_jsonb(v_max_bucket_ms), true);
        end if;
        insert into public.ai_response_cache (
          cache_key, episode_id, action_type, profile_mode, time_bucket_sec, provider_used, response_payload, origin_latency_ms, token_count, expires_at, last_accessed_at
        )
        values (
          btrim(p_cache_key), p_episode_id, btrim(coalesce(p_action_type, 'contextual_qa')),
          coalesce(p_profile_mode, 'quick_glance'::household_profile_mode), v_safe_bucket_sec,
          btrim(coalesce(p_provider_used, 'unknown')), v_sanitized_payload,
          case when p_origin_latency_ms is not null then greatest(0, p_origin_latency_ms) else null end,
          case when p_token_count is not null then greatest(0, p_token_count) else null end,
          now() + make_interval(secs => greatest(60, least(coalesce(p_ttl_seconds, 86400), 604800))),
          now()
        )
        on conflict (cache_key) do update set
          episode_id = excluded.episode_id,
          action_type = excluded.action_type,
          profile_mode = excluded.profile_mode,
          time_bucket_sec = excluded.time_bucket_sec,
          response_payload = excluded.response_payload,
          provider_used = excluded.provider_used,
          origin_latency_ms = excluded.origin_latency_ms,
          token_count = excluded.token_count,
          expires_at = excluded.expires_at,
          last_accessed_at = now();
      end;
      $$;

      create or replace function public.check_device_rate_limit(
        p_device_id text,
        p_window_sec integer default 60,
        p_max_requests integer default 30
      )
      returns jsonb
      language plpgsql
      volatile
      security definer
      set search_path = public
      as $$
      declare
        v_safe_device_id text := coalesce(nullif(btrim(p_device_id), ''), 'anonymous-firetv');
        v_safe_window integer := greatest(10, least(coalesce(p_window_sec, 60), 3600));
        v_safe_max integer := greatest(1, least(coalesce(p_max_requests, 30), 1000));
        v_window_start timestamptz;
        v_current_count integer;
        v_allowed boolean;
      begin
        perform public.assert_service_role_caller('check_device_rate_limit');
        v_window_start := to_timestamp(floor(extract(epoch from now()) / v_safe_window) * v_safe_window);
        insert into public.device_rate_limits (device_id, window_start, request_count, blocked_count, last_request_at)
        values (v_safe_device_id, v_window_start, 1, 0, now())
        on conflict (device_id, window_start) do update set
          request_count = public.device_rate_limits.request_count + 1,
          blocked_count = case
            when public.device_rate_limits.request_count >= v_safe_max
            then public.device_rate_limits.blocked_count + 1
            else public.device_rate_limits.blocked_count
          end,
          last_request_at = now()
        returning request_count into v_current_count;
        v_allowed := (v_current_count <= v_safe_max);
        return jsonb_build_object(
          'allowed', v_allowed,
          'device_id', v_safe_device_id,
          'current_count', v_current_count,
          'max_requests', v_safe_max,
          'remaining', greatest(0, v_safe_max - v_current_count),
          'window_reset_at', v_window_start + make_interval(secs => v_safe_window)
        );
      end;
      $$;
    `);

    // 4. Apply migration 0006_atomic_profile_deletion.sql
    const migration0006 = fs.readFileSync(
      resolveMigrationFile('supabase/migrations/0006_atomic_profile_deletion.sql'),
      'utf8',
    );
    await db.exec(migration0006);

    // 5. Apply migration 0007_typed_catalog_pagination.sql
    const migration0007 = fs.readFileSync(
      resolveMigrationFile('supabase/migrations/0007_typed_catalog_pagination.sql'),
      'utf8',
    );
    await db.exec(migration0007);

    // 6. Apply migration 0008_atomic_session_bookmarks_and_voting.sql
    const migration0008 = fs.readFileSync(
      resolveMigrationFile('supabase/migrations/0008_atomic_session_bookmarks_and_voting.sql'),
      'utf8',
    );
    await db.exec(migration0008);
  });

  afterEach(async () => {
    await db.exec('reset role;');
  });

  it('rejects anon and authenticated callers on delete_viewing_profile and permits service_role', async () => {
    // Test role anon
    await db.exec('set role anon;');
    await assert.rejects(
      async () => {
        await db.query(
          "select public.delete_viewing_profile('00000000-0000-0000-0000-000000000001'::uuid, 'test-device');",
        );
      },
      (err: any) => {
        // Must reject due to REVOKE or is_service_role_caller check
        const msg = (err?.message || '').toLowerCase();
        return msg.includes('permission denied') || msg.includes('service_role_required');
      },
    );

    // Test role authenticated
    await db.exec('set role authenticated;');
    await assert.rejects(
      async () => {
        await db.query(
          "select public.delete_viewing_profile('00000000-0000-0000-0000-000000000001'::uuid, 'test-device');",
        );
      },
      (err: any) => {
        const msg = (err?.message || '').toLowerCase();
        return msg.includes('permission denied') || msg.includes('service_role_required');
      },
    );

    // Test service_role
    await db.exec('set role service_role;');
    // Non-existent profile with service_role returns PROFILE_NOT_FOUND (P0002)
    await assert.rejects(
      async () => {
        await db.query(
          "select public.delete_viewing_profile('00000000-0000-0000-0000-000000000001'::uuid, 'test-device');",
        );
      },
      (err: any) => {
        return (err?.message || '').includes('PROFILE_NOT_FOUND');
      },
    );

    // Reset role to superuser
    await db.exec('reset role;');
  });

  it('enforces device ownership and prevents deleting sole profile on real PostgreSQL', async () => {
    await db.exec('set role service_role;');

    const devId = 'device-ownership-test';
    const ins = await db.query<{ id: string }>(
      `insert into public.profiles (device_id, display_name)
       values ($1, 'Profile 1'), ($1, 'Profile 2')
       returning id;`,
      [devId],
    );

    const prof1 = ins.rows[0].id;
    const prof2 = ins.rows[1].id;

    // 1. Mismatched device raises FORBIDDEN_DEVICE_MISMATCH (42501)
    await assert.rejects(
      async () => {
        await db.query(
          'select public.delete_viewing_profile($1::uuid, $2);',
          [prof1, 'rogue-device-intruder'],
        );
      },
      (err: any) => (err?.message || '').includes('FORBIDDEN_DEVICE_MISMATCH'),
    );

    // 2. Legitimate deletion of first profile succeeds
    const del1 = await db.query<{ delete_viewing_profile: any }>(
      'select public.delete_viewing_profile($1::uuid, $2);',
      [prof1, devId],
    );
    assert.equal(del1.rows[0].delete_viewing_profile.success, true);

    // 3. Attempting to delete the sole remaining profile is blocked (23514)
    await assert.rejects(
      async () => {
        await db.query(
          'select public.delete_viewing_profile($1::uuid, $2);',
          [prof2, devId],
        );
      },
      (err: any) => (err?.message || '').includes('CANNOT_DELETE_SOLE_PROFILE'),
    );

    // 4. Verify profile 2 still exists
    const check = await db.query(
      'select id from public.profiles where device_id = $1;',
      [devId],
    );
    assert.equal(check.rows.length, 1);
    assert.equal(check.rows[0].id, prof2);

    await db.exec('reset role;');
  });

  it('proves concurrent deletions against two different profiles on the same device leave at least one profile intact', async () => {
    await db.exec('set role service_role;');

    const devId = 'device-race-concurrency';
    const ins = await db.query<{ id: string }>(
      `insert into public.profiles (device_id, display_name)
       values ($1, 'Race Profile Alpha'), ($1, 'Race Profile Beta')
       returning id;`,
      [devId],
    );

    const profA = ins.rows[0].id;
    const profB = ins.rows[1].id;

    // Trigger concurrent deletions in parallel transactions
    const results = await Promise.allSettled([
      db.transaction(async (tx) => {
        return tx.query('select public.delete_viewing_profile($1::uuid, $2);', [profA, devId]);
      }),
      db.transaction(async (tx) => {
        return tx.query('select public.delete_viewing_profile($1::uuid, $2);', [profB, devId]);
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one deletion MUST succeed, and the other MUST be rejected!
    assert.equal(fulfilled.length, 1, 'Exactly one concurrent deletion transaction must succeed');
    assert.equal(rejected.length, 1, 'The competing concurrent deletion transaction must be rejected');

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason?.message || '';
    assert.ok(
      rejectionReason.includes('CANNOT_DELETE_SOLE_PROFILE'),
      `Expected CANNOT_DELETE_SOLE_PROFILE, got: ${rejectionReason}`,
    );

    // Verify exactly one profile remains in the database
    const remaining = await db.query(
      'select id from public.profiles where device_id = $1;',
      [devId],
    );
    assert.equal(remaining.rows.length, 1, 'At least one profile must strictly remain on the device');

    await db.exec('reset role;');
  });

  it('evaluates typed catalog pagination RPC with cursors, searches, and attack vectors on real PostgreSQL', async () => {
    await db.exec(`
      insert into public.programs (slug, title, genre, synopsis, release_year)
      values
        ('alien-awakening', 'Alien Awakening', 'Sci-Fi', 'First contact in deep space', 2024),
        ('blade-runner-echo', 'Blade Runner Echo', 'Sci-Fi / Noir', 'Synthetics and rain', 2025),
        ('cyber-city', 'Cyber City', 'Anime / Sci-Fi', 'Megastructure network security', 2023),
        ('dark-matter', 'Dark Matter', 'Documentary', 'Astrophysics and void mysteries', 2022);
    `);

    // 1. Initial page limit 2, ascending
    const p1 = await db.query<any>(
      'select * from public.get_paginated_programs(p_limit => 2, p_ascending => true);',
    );
    assert.equal(p1.rows.length, 2);
    assert.equal(p1.rows[0].title, 'Alien Awakening');
    assert.equal(p1.rows[1].title, 'Blade Runner Echo');

    // 2. Page 2 using continuation cursor from row 2
    const p2 = await db.query<any>(
      `select * from public.get_paginated_programs(
        p_limit => 2,
        p_cursor_title => $1,
        p_cursor_id => $2,
        p_ascending => true
      );`,
      [p1.rows[1].title, p1.rows[1].id],
    );
    assert.equal(p2.rows.length, 2);
    assert.equal(p2.rows[0].title, 'Cyber City');
    assert.equal(p2.rows[1].title, 'Dark Matter');

    // 3. Attack payloads against parameterized RPC: quotes, backslashes, newlines, brackets
    const attackInputs = [
      'Tears" OR 1=1--',
      "Tears' OR 1=1--",
      'Tears\\escape',
      'Tears\nNewline',
      'Tears;drop table public.programs;',
      'Tears{filter}',
      'Tears[array]',
      'Tears(parenthesis)',
      'gt.100,or(id.eq.1)',
    ];

    for (const attack of attackInputs) {
      const safeQuery = await db.query<any>(
        'select * from public.get_paginated_programs(p_query => $1);',
        [attack],
      );
      // Query executes safely without syntax errors or injection
      assert.ok(Array.isArray(safeQuery.rows));
    }
  });

  it('enforces check_device_rate_limit RPC sliding window and service_role permissions on real PostgreSQL', async () => {
    // 1. Anon caller rejected
    await db.exec('set role anon;');
    await assert.rejects(
      async () => {
        await db.query("select public.check_device_rate_limit('test-device', 60, 30);");
      },
      (err: any) => (err?.message || '').includes('service_role_required'),
    );

    // 2. Service role caller allowed
    await db.exec('set role service_role;');
    const devId = `rate-limit-test-${Date.now()}`;

    // Request 1: allowed, count 1, remaining 2
    const res1 = await db.query<any>(
      'select public.check_device_rate_limit($1, 60, 3) as r;',
      [devId],
    );
    const r1 = res1.rows[0].r;
    assert.equal(r1.allowed, true);
    assert.equal(r1.current_count, 1);
    assert.equal(r1.remaining, 2);
    assert.equal(r1.max_requests, 3);
    assert.ok(r1.window_reset_at);

    // Request 2 & 3
    await db.query('select public.check_device_rate_limit($1, 60, 3);', [devId]);
    const res3 = await db.query<any>(
      'select public.check_device_rate_limit($1, 60, 3) as r;',
      [devId],
    );
    const r3 = res3.rows[0].r;
    assert.equal(r3.allowed, true);
    assert.equal(r3.current_count, 3);
    assert.equal(r3.remaining, 0);

    // Request 4: limit exceeded (allowed = false)
    const res4 = await db.query<any>(
      'select public.check_device_rate_limit($1, 60, 3) as r;',
      [devId],
    );
    const r4 = res4.rows[0].r;
    assert.equal(r4.allowed, false);
    assert.equal(r4.current_count, 4);
    assert.equal(r4.remaining, 0);

    await db.exec('reset role;');
  });

  it('enforces upsert_ai_response_cache spoiler clamping and get_or_touch_ai_cache hit count & expiry', async () => {
    await db.exec('set role service_role;');

    const epRes = await db.query<{ id: string }>(
      `insert into public.episodes (title, duration_ms, default_bucket_sec)
       values ('Cache Test Ep', 300000, 15)
       returning id;`,
    );
    const episodeId = epRes.rows[0].id;
    const cacheKey = `test-cache-key-${Date.now()}`;

    // 1. Upsert with spoilerSafeUpToMs = 60000 in bucket 0 (max bucket ms = 15000)
    // The RPC must strictly clamp spoilerSafeUpToMs to 15000!
    await db.query(
      `select public.upsert_ai_response_cache(
        p_cache_key => $1,
        p_episode_id => $2,
        p_action_type => 'contextual_qa',
        p_profile_mode => 'quick_glance'::household_profile_mode,
        p_time_bucket_sec => 0,
        p_provider_used => 'groq',
        p_response_payload => $3::jsonb,
        p_origin_latency_ms => 120,
        p_token_count => 80,
        p_ttl_seconds => 3600
      );`,
      [
        cacheKey,
        episodeId,
        JSON.stringify({
          headline: 'Celia is an agent',
          body: 'Detailed backstory',
          spoilerSafeUpToMs: 60000, // Exceeds bucket boundary (15000)
        }),
      ],
    );

    // Verify row was stored with clamped spoilerSafeUpToMs
    const rowCheck = await db.query<any>(
      'select response_payload from public.ai_response_cache where cache_key = $1;',
      [cacheKey],
    );
    assert.equal(rowCheck.rows.length, 1);
    assert.equal(rowCheck.rows[0].response_payload.spoilerSafeUpToMs, 15000);

    // 2. get_or_touch_ai_cache returns unexpired payload and increments hit_count
    const touch1 = await db.query<any>(
      'select public.get_or_touch_ai_cache($1) as payload;',
      [cacheKey],
    );
    assert.ok(touch1.rows[0].payload);
    assert.equal(touch1.rows[0].payload.headline, 'Celia is an agent');

    const hitCheck = await db.query<any>(
      'select hit_count from public.ai_response_cache where cache_key = $1;',
      [cacheKey],
    );
    assert.equal(hitCheck.rows[0].hit_count, 1);

    // 3. Expire the cache entry and verify get_or_touch_ai_cache returns NULL
    await db.query(
      "update public.ai_response_cache set expires_at = now() - interval '1 second' where cache_key = $1;",
      [cacheKey],
    );
    const touchExpired = await db.query<any>(
      'select public.get_or_touch_ai_cache($1) as payload;',
      [cacheKey],
    );
    assert.equal(touchExpired.rows[0].payload, null);

    await db.exec('reset role;');
  });

  it('enforces atomic session bookmarks: profile ownership, deduplication, expiry reset, and parallel concurrency', async () => {
    await db.exec('set role service_role;');

    const devId = `dev-session-test-${Date.now()}`;
    const otherDevId = 'rogue-device-403';

    const pRes = await db.query<{ id: string }>(
      'insert into public.profiles (device_id, display_name) values ($1, $2) returning id;',
      [devId, 'Owner Profile'],
    );
    const ownerProfileId = pRes.rows[0].id;

    const epRes = await db.query<{ id: string }>(
      "insert into public.episodes (title, duration_ms) values ('Session Ep', 600000) returning id;",
    );
    const episodeId = epRes.rows[0].id;

    const bookmark1 = {
      id: 'bm-1',
      label: 'Crucial Revelation',
      playbackPositionMs: 12000,
    };

    // 1. Mismatched profile ownership raises 42501 PROFILE_MISMATCH
    await assert.rejects(
      async () => {
        await db.query(
          'select public.add_session_bookmark($1, $2::uuid, $3::uuid, $4::jsonb, 12000);',
          [otherDevId, episodeId, ownerProfileId, JSON.stringify(bookmark1)],
        );
      },
      (err: any) => (err?.message || '').includes('PROFILE_MISMATCH'),
    );

    // 2. Initial bookmark creates active session
    const createRes = await db.query<any>(
      'select public.add_session_bookmark($1, $2::uuid, $3::uuid, $4::jsonb, 12000) as res;',
      [devId, episodeId, ownerProfileId, JSON.stringify(bookmark1)],
    );
    const r1 = createRes.rows[0].res;
    assert.equal(r1.success, true);
    assert.equal(r1.bookmarked_moments.length, 1);
    assert.equal(r1.bookmarked_moments[0].label, 'Crucial Revelation');

    // 3. Second distinct bookmark appends to the session
    const bookmark2 = {
      id: 'bm-2',
      label: 'Plot Twist',
      playbackPositionMs: 34000,
    };
    const appendRes = await db.query<any>(
      'select public.add_session_bookmark($1, $2::uuid, $3::uuid, $4::jsonb, 34000) as res;',
      [devId, episodeId, ownerProfileId, JSON.stringify(bookmark2)],
    );
    const r2 = appendRes.rows[0].res;
    assert.equal(r2.bookmarked_moments.length, 2);

    // 4. Duplicate bookmark is deduplicated and not duplicated in the array
    const dupRes = await db.query<any>(
      'select public.add_session_bookmark($1, $2::uuid, $3::uuid, $4::jsonb, 34000) as res;',
      [devId, episodeId, ownerProfileId, JSON.stringify(bookmark2)],
    );
    const rDup = dupRes.rows[0].res;
    assert.equal(rDup.bookmarked_moments.length, 2);

    // 5. Expired session is reset to a fresh active session on new bookmark
    await db.query(
      "update public.conversation_sessions set expires_at = now() - interval '1 hour' where device_id = $1 and episode_id = $2::uuid;",
      [devId, episodeId],
    );
    const bookmark3 = {
      id: 'bm-3',
      label: 'Fresh Session Moment',
      playbackPositionMs: 5000,
    };
    const freshRes = await db.query<any>(
      'select public.add_session_bookmark($1, $2::uuid, $3::uuid, $4::jsonb, 5000) as res;',
      [devId, episodeId, ownerProfileId, JSON.stringify(bookmark3)],
    );
    const rFresh = freshRes.rows[0].res;
    // Expired session reset to 1 fresh bookmark
    assert.equal(rFresh.bookmarked_moments.length, 1);
    assert.equal(rFresh.bookmarked_moments[0].label, 'Fresh Session Moment');

    // 6. Concurrency test: execute parallel bookmark appends
    const concurrentBm1 = { id: 'bm-c1', label: 'Concurrent Alpha', playbackPositionMs: 60000 };
    const concurrentBm2 = { id: 'bm-c2', label: 'Concurrent Beta', playbackPositionMs: 75000 };

    await Promise.all([
      db.query('select public.add_session_bookmark($1, $2::uuid, $3::uuid, $4::jsonb, 60000);', [
        devId,
        episodeId,
        ownerProfileId,
        JSON.stringify(concurrentBm1),
      ]),
      db.query('select public.add_session_bookmark($1, $2::uuid, $3::uuid, $4::jsonb, 75000);', [
        devId,
        episodeId,
        ownerProfileId,
        JSON.stringify(concurrentBm2),
      ]),
    ]);

    const sessionCheck = await db.query<any>(
      'select bookmarked_moments from public.conversation_sessions where device_id = $1 and episode_id = $2::uuid;',
      [devId, episodeId],
    );
    const moments = sessionCheck.rows[0].bookmarked_moments;
    const labels = moments.map((m: any) => m.label);
    assert.ok(labels.includes('Concurrent Alpha'), 'Concurrent Alpha bookmark must be preserved');
    assert.ok(labels.includes('Concurrent Beta'), 'Concurrent Beta bookmark must be preserved');

    await db.exec('reset role;');
  });

  it('enforces atomic vote_interaction_atomic ownership verification and prevents TOCTOU race', async () => {
    await db.exec('set role service_role;');

    const devA = 'device-voter-a';
    const devB = 'device-intruder-b';

    const profRes = await db.query<{ id: string }>(
      'insert into public.profiles (device_id, display_name) values ($1, $2) returning id;',
      [devA, 'Voter Profile A'],
    );
    const profileA = profRes.rows[0].id;

    const epRes = await db.query<{ id: string }>(
      "insert into public.episodes (title) values ('Vote Test Ep') returning id;",
    );
    const episodeId = epRes.rows[0].id;

    const intRes = await db.query<{ id: string }>(
      `insert into public.interaction_history (device_id, profile_id, episode_id, playback_position_ms)
       values ($1, $2, $3, 15000)
       returning id;`,
      [devA, profileA, episodeId],
    );
    const interactionId = intRes.rows[0].id;

    // 1. Voting from legitimate device A succeeds
    const voteRes = await db.query<any>(
      'select public.vote_interaction_atomic($1::uuid, $2, 1) as res;',
      [interactionId, devA],
    );
    assert.equal(voteRes.rows[0].res.success, true);
    assert.equal(voteRes.rows[0].res.vote, 1);

    // Verify row updated in database
    const check1 = await db.query<any>(
      'select user_helpful_vote from public.interaction_history where id = $1::uuid;',
      [interactionId],
    );
    assert.equal(check1.rows[0].user_helpful_vote, 1);

    // 2. Voting from unauthorized device B fails with 42501 FORBIDDEN
    await assert.rejects(
      async () => {
        await db.query(
          'select public.vote_interaction_atomic($1::uuid, $2, -1);',
          [interactionId, devB],
        );
      },
      (err: any) => (err?.message || '').includes('FORBIDDEN'),
    );

    // 3. TOCTOU prevention: Reassign profile to device B, now device A vote is blocked
    await db.query(
      'update public.profiles set device_id = $1 where id = $2::uuid;',
      [devB, profileA],
    );
    await assert.rejects(
      async () => {
        await db.query(
          'select public.vote_interaction_atomic($1::uuid, $2, -1);',
          [interactionId, devA],
        );
      },
      (err: any) => (err?.message || '').includes('FORBIDDEN'),
    );

    // 4. Non-existent interaction raises INTERACTION_NOT_FOUND
    await assert.rejects(
      async () => {
        await db.query(
          "select public.vote_interaction_atomic('00000000-0000-0000-0000-000000000099'::uuid, $1, 1);",
          [devA],
        );
      },
      (err: any) => (err?.message || '').includes('INTERACTION_NOT_FOUND'),
    );

    await db.exec('reset role;');
  });
});
