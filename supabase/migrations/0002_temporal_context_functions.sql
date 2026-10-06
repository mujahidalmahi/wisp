-- ============================================================================
-- Migration: 0002_temporal_context_functions.sql
-- Purpose:   Production-Grade Deterministic Anti-Spoiler Temporal Context RPCs,
--            Full-Text Search, TTL Cache Management, Rate Limiting & Telemetry.
-- Security:
--   1. All RPCs use a locked `SET search_path = public`.
--   2. Read-only spoiler-safe RPCs (`get_spoiler_safe_context`,
--      `search_spoiler_safe_transcript`, `get_episode_post_watch_quiz`)
--      enforce `e.is_published = true AND p.is_active = true`, clamp
--      `p_playback_ms` to `[0, e.duration_ms]`, and enforce hard anti-spoiler
--      gates (`end_time_ms <= p_playback_ms`, `reveal_time_ms <= p_playback_ms`).
--   3. State-mutating / privileged RPCs (`get_or_touch_ai_cache`,
--      `upsert_ai_response_cache`, `check_device_rate_limit`,
--      `record_wisp_interaction`) have `EXECUTE` explicitly revoked from
--      `PUBLIC, anon, authenticated`, granted ONLY to `service_role`, and
--      enforce an internal caller authorization check (`assert_service_role_caller`)
--      plus entity/episode/payload integrity validation to prevent cache
--      poisoning and telemetry/history forgery.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Internal Security Helpers: public.is_service_role_caller & public.assert_service_role_caller
--    Accurately detects the active caller role even inside SECURITY DEFINER
--    functions where `current_user` becomes the function owner (`postgres`)
--    and PostgREST sets `SET LOCAL ROLE anon` / `authenticated` (`current_setting('role')`).
-- ----------------------------------------------------------------------------
create or replace function public.is_service_role_caller()
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_active_role text := coalesce(nullif(current_setting('role', true), ''), 'none');
  v_jwt_role text := nullif(current_setting('request.jwt.claim.role', true), '');
  v_claims_json text := nullif(current_setting('request.jwt.claims', true), '');
begin
  if v_jwt_role is null and v_claims_json is not null then
    begin
      v_jwt_role := (v_claims_json::jsonb)->>'role';
    exception
      when others then
        v_jwt_role := null;
    end;
  end if;

  -- If SET LOCAL ROLE anon / authenticated is active, it is NOT a service_role caller
  if v_active_role in ('anon', 'authenticated') then
    return false;
  end if;

  if v_active_role in ('service_role', 'postgres') then
    return true;
  end if;

  if v_active_role = 'none'
     and session_user in ('postgres', 'service_role')
     and coalesce(v_jwt_role, 'service_role') = 'service_role'
  then
    return true;
  end if;

  return false;
end;
$$;

comment on function public.is_service_role_caller() is
  'Returns true only when the active caller role is service_role or an unmasqueraded postgres admin session.';

create or replace function public.assert_service_role_caller(
  p_rpc_name text
)
returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if public.is_service_role_caller() then
    return;
  end if;

  raise exception 'Permission denied for RPC %: restricted to trusted service_role backend', p_rpc_name
    using errcode = '42501';
end;
$$;

comment on function public.assert_service_role_caller(text) is
  'Internal guard ensuring privileged write, cache, and telemetry RPCs can only be executed by service_role or postgres.';

revoke all on function public.is_service_role_caller() from public, anon, authenticated;
grant execute on function public.is_service_role_caller() to anon, authenticated, service_role;

revoke all on function public.assert_service_role_caller(text) from public, anon, authenticated;
grant execute on function public.assert_service_role_caller(text) to service_role;

-- ----------------------------------------------------------------------------
-- 1. Core RPC: public.get_spoiler_safe_context
--    Enforces mathematical anti-spoiler boundary at the database layer:
--      * episodes/programs:    e.is_published = true and p.is_active = true
--      * transcript_segments:  ts.end_time_ms <= p_playback_ms
--      * entity_appearances:   ea.reveal_time_ms <= p_playback_ms
--      * entity_relationships: er.reveal_time_ms <= p_playback_ms
--      * scene_contexts:       sc.start_time_ms <= p_playback_ms
-- ----------------------------------------------------------------------------
create or replace function public.get_spoiler_safe_context(
  p_episode_id uuid,
  p_playback_ms bigint,
  p_lookback_ms bigint default 180000
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_duration_ms bigint;
  v_safe_playback_ms bigint;
  v_safe_lookback_ms bigint;
  v_program_record jsonb;
  v_active_scene jsonb;
  v_prior_scenes jsonb;
  v_recent_transcript jsonb;
  v_unlocked_entities jsonb;
  v_unlocked_relationships jsonb;
begin
  -- Edge-Case Guard 1: Clamp negative playback position to 0ms
  v_safe_playback_ms := greatest(0, coalesce(p_playback_ms, 0));

  -- Edge-Case Guard 2: Clamp lookback window between 5 seconds and 15 minutes
  v_safe_lookback_ms := greatest(5000, least(coalesce(p_lookback_ms, 180000), 900000));

  -- 1. Fetch active Program & published Episode metadata (and clamp playback to episode duration)
  select
    e.duration_ms,
    jsonb_build_object(
      'program_title', p.title,
      'genre', p.genre,
      'rating', p.rating,
      'episode_title', e.title,
      'season_number', e.season_number,
      'episode_number', e.episode_number,
      'duration_ms', e.duration_ms,
      'playback_position_ms', least(v_safe_playback_ms, e.duration_ms)
    )
  into v_duration_ms, v_program_record
  from public.episodes e
  join public.programs p on p.id = e.program_id
  where e.id = p_episode_id
    and e.is_published = true
    and p.is_active = true;

  -- Edge-Case Guard 3: Unknown or unpublished episode ID returns safe empty context object
  if v_program_record is null then
    return jsonb_build_object(
      'found', false,
      'metadata', jsonb_build_object(
        'program_title', 'Unknown Program',
        'genre', 'Unknown',
        'episode_title', 'Unknown Episode',
        'season_number', 1,
        'episode_number', 1,
        'playback_position_ms', v_safe_playback_ms
      ),
      'active_scene', '{}'::jsonb,
      'prior_scenes', '[]'::jsonb,
      'recent_transcript', '[]'::jsonb,
      'unlocked_entities', '[]'::jsonb,
      'unlocked_relationships', '[]'::jsonb
    );
  end if;

  -- Clamp effective playback position to episode duration
  v_safe_playback_ms := least(v_safe_playback_ms, v_duration_ms);

  -- 2. Fetch Active Scene at current playback head
  select jsonb_build_object(
    'scene_index', sc.scene_index,
    'scene_title', sc.scene_title,
    'location_name', sc.location_name,
    'mood_tag', sc.mood_tag,
    'narrative_tension_score', sc.narrative_tension_score,
    'spoiler_safe_summary', sc.spoiler_safe_summary,
    'quick_action_chips', sc.quick_action_chips
  )
  into v_active_scene
  from public.scene_contexts sc
  where sc.episode_id = p_episode_id
    and sc.start_time_ms <= v_safe_playback_ms
  order by sc.start_time_ms desc, sc.scene_index desc
  limit 1;

  -- 3. Fetch Completed & Active Scene Summaries up to current playback head (for Spoiler-Safe Recap)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'scene_index', sc.scene_index,
      'scene_title', sc.scene_title,
      'location_name', sc.location_name,
      'summary', sc.spoiler_safe_summary
    ) order by sc.scene_index asc
  ), '[]'::jsonb)
  into v_prior_scenes
  from public.scene_contexts sc
  where sc.episode_id = p_episode_id
    and sc.start_time_ms <= v_safe_playback_ms;

  -- 4. Fetch Strictly Bounded Transcript Segments within lookback window
  --    HARD INVARIANT: ts.end_time_ms <= v_safe_playback_ms (never leak future lines!)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'start_time_ms', ts.start_time_ms,
      'end_time_ms', ts.end_time_ms,
      'speaker', ts.speaker_name,
      'dialogue', ts.dialogue_text,
      'visual_cue', ts.visual_cue,
      'is_key_plot_point', ts.is_key_plot_point
    ) order by ts.start_time_ms asc
  ), '[]'::jsonb)
  into v_recent_transcript
  from public.transcript_segments ts
  where ts.episode_id = p_episode_id
    and ts.end_time_ms <= v_safe_playback_ms
    and ts.start_time_ms >= greatest(0, v_safe_playback_ms - v_safe_lookback_ms);

  -- 5. Fetch Entities & Only Facts Revealed Up To v_safe_playback_ms
  --    HARD INVARIANT: ea.reveal_time_ms <= v_safe_playback_ms (prevents plot twist spoilers!)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'slug', ent.slug,
      'name', ent.name,
      'type', ent.entity_type,
      'base_description', ent.base_description,
      'progressive_fact', ea.progressive_fact,
      'is_plot_twist', ea.is_plot_twist,
      'importance_rank', ea.importance_rank,
      'in_current_scene', (v_safe_playback_ms between ea.start_time_ms and ea.end_time_ms)
    ) order by ea.importance_rank asc, ea.reveal_time_ms desc
  ), '[]'::jsonb)
  into v_unlocked_entities
  from public.entity_appearances ea
  join public.entities ent on ent.id = ea.entity_id
  where ea.episode_id = p_episode_id
    and ea.reveal_time_ms <= v_safe_playback_ms
    and ent.spoiler_floor_ms <= v_safe_playback_ms;

  -- 6. Fetch Unlocked Entity Relationships up to v_safe_playback_ms
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'source_entity', src.name,
      'target_entity', tgt.name,
      'relationship_type', er.relationship_type,
      'summary', er.relationship_summary
    ) order by er.reveal_time_ms asc
  ), '[]'::jsonb)
  into v_unlocked_relationships
  from public.entity_relationships er
  join public.entities src on src.id = er.source_entity_id
  join public.entities tgt on tgt.id = er.target_entity_id
  where er.episode_id = p_episode_id
    and er.reveal_time_ms <= v_safe_playback_ms
    and er.valid_from_ms <= v_safe_playback_ms
    and (er.valid_until_ms is null or er.valid_until_ms >= v_safe_playback_ms)
    and src.spoiler_floor_ms <= v_safe_playback_ms
    and tgt.spoiler_floor_ms <= v_safe_playback_ms;

  return jsonb_build_object(
    'found', true,
    'metadata', coalesce(v_program_record, '{}'::jsonb),
    'active_scene', coalesce(v_active_scene, '{}'::jsonb),
    'prior_scenes', v_prior_scenes,
    'recent_transcript', v_recent_transcript,
    'unlocked_entities', v_unlocked_entities,
    'unlocked_relationships', v_unlocked_relationships
  );
end;
$$;

comment on function public.get_spoiler_safe_context(uuid, bigint, bigint) is
  'Primary SECURITY DEFINER anti-spoiler context windowing RPC enforcing end_time_ms <= p_playback_ms and reveal_time_ms <= p_playback_ms.';

-- ----------------------------------------------------------------------------
-- 2. RPC: public.search_spoiler_safe_transcript
--    Allows open-ended viewer questions to recall dialogue from earlier scenes
--    (even outside the 3-minute rolling window) while strictly enforcing
--    ts.end_time_ms <= v_safe_playback_ms on published episodes.
-- ----------------------------------------------------------------------------
create or replace function public.search_spoiler_safe_transcript(
  p_episode_id uuid,
  p_playback_ms bigint,
  p_search_query text,
  p_limit integer default 8
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_duration_ms bigint;
  v_safe_playback_ms bigint := greatest(0, coalesce(p_playback_ms, 0));
  v_safe_limit integer := greatest(1, least(coalesce(p_limit, 8), 25));
  v_clean_query text := btrim(coalesce(p_search_query, ''));
  v_escaped_ilike text;
  v_results jsonb;
begin
  if v_clean_query = '' then
    return '[]'::jsonb;
  end if;

  v_escaped_ilike := replace(replace(replace(v_clean_query, '\', '\\'), '%', '\%'), '_', '\_');

  select e.duration_ms into v_duration_ms
  from public.episodes e
  join public.programs p on p.id = e.program_id
  where e.id = p_episode_id
    and e.is_published = true
    and p.is_active = true;

  if v_duration_ms is null then
    return '[]'::jsonb;
  end if;

  v_safe_playback_ms := least(v_safe_playback_ms, v_duration_ms);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'start_time_ms', matched.start_time_ms,
      'end_time_ms', matched.end_time_ms,
      'speaker', matched.speaker_name,
      'dialogue', matched.dialogue_text,
      'visual_cue', matched.visual_cue,
      'relevance_score', round(matched.score::numeric, 4)
    )
  ), '[]'::jsonb)
  into v_results
  from (
    select
      ts.start_time_ms,
      ts.end_time_ms,
      ts.speaker_name,
      ts.dialogue_text,
      ts.visual_cue,
      (
        coalesce(ts_rank_cd(ts.search_vector, websearch_to_tsquery('english', v_clean_query)), 0) * 2.0 +
        coalesce(similarity(ts.dialogue_text, v_clean_query), 0)
      ) as score
    from public.transcript_segments ts
    where ts.episode_id = p_episode_id
      and ts.end_time_ms <= v_safe_playback_ms
      and (
        ts.search_vector @@ websearch_to_tsquery('english', v_clean_query)
        or ts.dialogue_text % v_clean_query
        or ts.dialogue_text ilike ('%' || v_escaped_ilike || '%') escape '\'
      )
    order by score desc, ts.start_time_ms desc
    limit v_safe_limit
  ) matched;

  return v_results;
end;
$$;

comment on function public.search_spoiler_safe_transcript(uuid, bigint, text, integer) is
  'Hybrid Full-Text + Trigram SECURITY DEFINER search over episode transcript lines strictly gated by end_time_ms <= p_playback_ms.';

-- ----------------------------------------------------------------------------
-- 3. RPC: public.get_episode_post_watch_quiz
--    Returns verified multiple-choice questions unlocked up to p_playback_ms.
-- ----------------------------------------------------------------------------
create or replace function public.get_episode_post_watch_quiz(
  p_episode_id uuid,
  p_playback_ms bigint,
  p_profile_mode household_profile_mode default 'quick_glance',
  p_limit integer default 3
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_duration_ms bigint;
  v_safe_playback_ms bigint := greatest(0, coalesce(p_playback_ms, 0));
  v_safe_limit integer := greatest(1, least(coalesce(p_limit, 3), 10));
  v_quizzes jsonb;
begin
  select e.duration_ms into v_duration_ms
  from public.episodes e
  join public.programs p on p.id = e.program_id
  where e.id = p_episode_id
    and e.is_published = true
    and p.is_active = true;

  if v_duration_ms is null then
    return '[]'::jsonb;
  end if;

  v_safe_playback_ms := least(v_safe_playback_ms, v_duration_ms);

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', eq.id,
      'unlock_time_ms', eq.unlock_time_ms,
      'profile_mode', eq.profile_mode,
      'difficulty', eq.difficulty_level,
      'question', eq.question_text,
      'options', eq.options,
      'correctIndex', eq.correct_option_index,
      'explanation', eq.explanation_text
    )
  ), '[]'::jsonb)
  into v_quizzes
  from (
    select *
    from public.episode_quizzes eq
    where eq.episode_id = p_episode_id
      and eq.unlock_time_ms <= v_safe_playback_ms
    order by
      (case when eq.profile_mode = p_profile_mode then 0 else 1 end) asc,
      eq.unlock_time_ms desc
    limit v_safe_limit
  ) eq;

  return v_quizzes;
end;
$$;

comment on function public.get_episode_post_watch_quiz(uuid, bigint, household_profile_mode, integer) is
  'Fetches spoiler-safe multiple-choice trivia questions unlocked up to the current playback position.';

-- ----------------------------------------------------------------------------
-- 4. RPC: public.get_or_touch_ai_cache (Restricted to service_role)
--    Atomically retrieves an unexpired cached AI card and increments hit_count.
-- ----------------------------------------------------------------------------
create or replace function public.get_or_touch_ai_cache(
  p_cache_key text
)
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
  set
    hit_count = hit_count + 1,
    last_accessed_at = now()
  where cache_key = btrim(p_cache_key)
    and expires_at > now()
  returning response_payload into v_payload;

  return v_payload;
end;
$$;

comment on function public.get_or_touch_ai_cache(text) is
  'Backend-only (service_role) RPC that atomically fetches an unexpired cached AI card by cache_key and increments hit_count.';

-- ----------------------------------------------------------------------------
-- 5. RPC: public.upsert_ai_response_cache (Restricted to service_role)
--    Inserts or updates a 15-second bucket AI response cache entry with TTL.
--    Validates caller authorization (`service_role`), episode existence,
--    cache_key format, and clamps spoilerSafeUpToMs to prevent cache poisoning.
-- ----------------------------------------------------------------------------
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
  -- 1. Enforce trusted backend / service_role caller authorization
  perform public.assert_service_role_caller('upsert_ai_response_cache');

  -- 2. Validate required parameters and payload structure
  if p_cache_key is null or char_length(btrim(p_cache_key)) < 5 then
    raise exception 'Invalid cache_key supplied to upsert_ai_response_cache'
      using errcode = '22023';
  end if;

  if p_response_payload is null or jsonb_typeof(p_response_payload) <> 'object' then
    raise exception 'Invalid response_payload supplied to upsert_ai_response_cache: JSON object required'
      using errcode = '22023';
  end if;

  select e.duration_ms, coalesce(e.default_bucket_sec, 15)
  into v_duration_ms, v_episode_bucket_sec
  from public.episodes e
  where e.id = p_episode_id;

  if v_duration_ms is null then
    raise exception 'Episode % does not exist for upsert_ai_response_cache', p_episode_id
      using errcode = '23503';
  end if;

  -- 3. Ensure cached payload spoilerSafeUpToMs cannot exceed the bucket ceiling or episode duration
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
    cache_key,
    episode_id,
    action_type,
    profile_mode,
    time_bucket_sec,
    provider_used,
    response_payload,
    origin_latency_ms,
    token_count,
    expires_at,
    last_accessed_at
  )
  values (
    btrim(p_cache_key),
    p_episode_id,
    btrim(coalesce(p_action_type, 'contextual_qa')),
    coalesce(p_profile_mode, 'quick_glance'::household_profile_mode),
    v_safe_bucket_sec,
    btrim(coalesce(p_provider_used, 'unknown')),
    v_sanitized_payload,
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

comment on function public.upsert_ai_response_cache(text, uuid, text, household_profile_mode, integer, text, jsonb, integer, integer, integer) is
  'Backend-only (service_role) RPC that validates and upserts a spoiler-clamped AI response card into the 15-second temporal bucket cache.';

-- ----------------------------------------------------------------------------
-- 6. RPC: public.check_device_rate_limit (Restricted to service_role)
--    Database-backed sliding window rate limiter protecting LLM quotas.
-- ----------------------------------------------------------------------------
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

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / v_safe_window) * v_safe_window
  );

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

comment on function public.check_device_rate_limit(text, integer, integer) is
  'Backend-only (service_role) RPC enforcing per-device request rate limits per time window to prevent LLM quota exhaustion.';

-- ----------------------------------------------------------------------------
-- 7. RPC: public.record_wisp_interaction (Restricted to service_role)
--    Atomically logs interaction_history, updates hourly ai_provider_metrics,
--    and increments profile usage counters in a single database transaction.
--    Enforces service_role caller verification and validates episode/profile
--    references before writing any records.
-- ----------------------------------------------------------------------------
create or replace function public.record_wisp_interaction(
  p_profile_id uuid,
  p_episode_id uuid,
  p_playback_position_ms bigint,
  p_action_type text,
  p_user_prompt text,
  p_ai_provider text,
  p_latency_ms integer,
  p_cache_hit boolean,
  p_response_card jsonb,
  p_prompt_tokens integer default 0,
  p_completion_tokens integer default 0,
  p_failover_triggered boolean default false,
  p_error_code text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_interaction_id uuid;
  v_episode_duration_ms bigint;
  v_verified_profile_id uuid := null;
  v_bucket_hour timestamptz := date_trunc('hour', now());
  v_safe_playback_ms bigint;
  v_safe_latency integer := greatest(0, least(coalesce(p_latency_ms, 0), 600000));
  v_safe_prompt_tokens integer := greatest(0, least(coalesce(p_prompt_tokens, 0), 1000000));
  v_safe_completion_tokens integer := greatest(0, least(coalesce(p_completion_tokens, 0), 1000000));
  v_total_tokens integer := v_safe_prompt_tokens + v_safe_completion_tokens;
  v_safe_action_type text := coalesce(nullif(btrim(p_action_type), ''), 'contextual_qa');
  v_safe_provider text := coalesce(nullif(btrim(p_ai_provider), ''), 'unknown');
begin
  -- 1. Enforce trusted backend / service_role caller authorization
  perform public.assert_service_role_caller('record_wisp_interaction');

  -- 2. Verify that the target episode exists and clamp playback position to [0, duration_ms]
  select e.duration_ms into v_episode_duration_ms
  from public.episodes e
  where e.id = p_episode_id;

  if v_episode_duration_ms is null then
    raise exception 'Episode % does not exist for record_wisp_interaction', p_episode_id
      using errcode = '23503';
  end if;

  v_safe_playback_ms := least(greatest(0, coalesce(p_playback_position_ms, 0)), v_episode_duration_ms);

  -- 3. Verify that p_profile_id exists if supplied
  if p_profile_id is not null then
    select pr.id into v_verified_profile_id
    from public.profiles pr
    where pr.id = p_profile_id;

    if v_verified_profile_id is null then
      raise exception 'Profile % does not exist for record_wisp_interaction', p_profile_id
        using errcode = '23503';
    end if;
  end if;

  -- 4. Insert interaction history record (triggers trg_fn_enforce_interaction_spoiler_gate)
  insert into public.interaction_history (
    profile_id,
    episode_id,
    playback_position_ms,
    action_type,
    user_prompt,
    ai_provider,
    latency_ms,
    cache_hit,
    prompt_tokens,
    completion_tokens,
    error_code,
    response_card
  )
  values (
    v_verified_profile_id,
    p_episode_id,
    v_safe_playback_ms,
    v_safe_action_type,
    coalesce(nullif(btrim(p_user_prompt), ''), v_safe_action_type),
    v_safe_provider,
    v_safe_latency,
    coalesce(p_cache_hit, false),
    v_safe_prompt_tokens,
    v_safe_completion_tokens,
    nullif(btrim(p_error_code), ''),
    case
      when p_response_card is not null and jsonb_typeof(p_response_card) = 'object'
      then p_response_card
      else '{}'::jsonb
    end
  )
  returning id into v_interaction_id;

  -- 5. Upsert hourly AI provider telemetry metrics
  insert into public.ai_provider_metrics (
    bucket_hour,
    provider_name,
    action_type,
    total_requests,
    successful_requests,
    failed_requests,
    cache_hits,
    failover_count,
    total_latency_ms,
    min_latency_ms,
    max_latency_ms,
    total_tokens,
    updated_at
  )
  values (
    v_bucket_hour,
    v_safe_provider,
    v_safe_action_type,
    1,
    case when p_error_code is null then 1 else 0 end,
    case when p_error_code is not null then 1 else 0 end,
    case when coalesce(p_cache_hit, false) then 1 else 0 end,
    case when coalesce(p_failover_triggered, false) then 1 else 0 end,
    v_safe_latency,
    v_safe_latency,
    v_safe_latency,
    v_total_tokens,
    now()
  )
  on conflict (bucket_hour, provider_name, action_type) do update set
    total_requests = public.ai_provider_metrics.total_requests + 1,
    successful_requests = public.ai_provider_metrics.successful_requests + (case when p_error_code is null then 1 else 0 end),
    failed_requests = public.ai_provider_metrics.failed_requests + (case when p_error_code is not null then 1 else 0 end),
    cache_hits = public.ai_provider_metrics.cache_hits + (case when coalesce(p_cache_hit, false) then 1 else 0 end),
    failover_count = public.ai_provider_metrics.failover_count + (case when coalesce(p_failover_triggered, false) then 1 else 0 end),
    total_latency_ms = public.ai_provider_metrics.total_latency_ms + v_safe_latency,
    min_latency_ms = least(coalesce(public.ai_provider_metrics.min_latency_ms, v_safe_latency), v_safe_latency),
    max_latency_ms = greatest(coalesce(public.ai_provider_metrics.max_latency_ms, v_safe_latency), v_safe_latency),
    total_tokens = public.ai_provider_metrics.total_tokens + v_total_tokens,
    updated_at = now();

  -- 6. Update profile activity counter if a verified profile_id was supplied
  if v_verified_profile_id is not null then
    update public.profiles
    set
      total_queries_count = total_queries_count + 1,
      last_active_at = now(),
      updated_at = now()
    where id = v_verified_profile_id;
  end if;

  return v_interaction_id;
end;
$$;

comment on function public.record_wisp_interaction(uuid, uuid, bigint, text, text, text, integer, boolean, jsonb, integer, integer, boolean, text) is
  'Backend-only (service_role) transactional logger recording viewer interactions, updating hourly AI provider telemetry, and incrementing profile activity counters.';

-- ----------------------------------------------------------------------------
-- 8. Explicit RPC Execution Privilege Revocations & Scoped Grants
--    Note: PostgreSQL grants EXECUTE to PUBLIC by default on new functions.
--    We explicitly revoke from PUBLIC, anon, and authenticated on all write /
--    cache / rate-limit RPCs and grant them exclusively to service_role.
-- ----------------------------------------------------------------------------
revoke all on function public.get_spoiler_safe_context(uuid, bigint, bigint) from public;
grant execute on function public.get_spoiler_safe_context(uuid, bigint, bigint) to anon, authenticated, service_role;

revoke all on function public.search_spoiler_safe_transcript(uuid, bigint, text, integer) from public;
grant execute on function public.search_spoiler_safe_transcript(uuid, bigint, text, integer) to anon, authenticated, service_role;

revoke all on function public.get_episode_post_watch_quiz(uuid, bigint, household_profile_mode, integer) from public;
grant execute on function public.get_episode_post_watch_quiz(uuid, bigint, household_profile_mode, integer) to anon, authenticated, service_role;

revoke all on function public.get_or_touch_ai_cache(text) from public, anon, authenticated;
grant execute on function public.get_or_touch_ai_cache(text) to service_role;

revoke all on function public.upsert_ai_response_cache(text, uuid, text, household_profile_mode, integer, text, jsonb, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.upsert_ai_response_cache(text, uuid, text, household_profile_mode, integer, text, jsonb, integer, integer, integer) to service_role;

revoke all on function public.check_device_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_device_rate_limit(text, integer, integer) to service_role;

revoke all on function public.record_wisp_interaction(uuid, uuid, bigint, text, text, text, integer, boolean, jsonb, integer, integer, boolean, text) from public, anon, authenticated;
grant execute on function public.record_wisp_interaction(uuid, uuid, bigint, text, text, text, integer, boolean, jsonb, integer, integer, boolean, text) to service_role;
