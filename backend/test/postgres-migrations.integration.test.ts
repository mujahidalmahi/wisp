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

    // 2. Create base tables required by migrations 0006 & 0007
    await db.exec(`
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

    // 3. Apply migration 0006_atomic_profile_deletion.sql
    const migration0006 = fs.readFileSync(
      resolveMigrationFile('supabase/migrations/0006_atomic_profile_deletion.sql'),
      'utf8',
    );
    await db.exec(migration0006);

    // 4. Apply migration 0007_typed_catalog_pagination.sql
    const migration0007 = fs.readFileSync(
      resolveMigrationFile('supabase/migrations/0007_typed_catalog_pagination.sql'),
      'utf8',
    );
    await db.exec(migration0007);
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
});
