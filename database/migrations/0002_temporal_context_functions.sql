-- ============================================================================
-- Migration: 0002_temporal_context_functions.sql
-- Purpose:   Production-Grade Deterministic Anti-Spoiler Temporal Context RPCs,
--            Full-Text Search, TTL Cache Management, Rate Limiting & Telemetry.
-- Security:  All callable RPCs are marked SECURITY DEFINER with a locked
--            SET search_path = public so that untrusted roles (anon /
--            authenticated) can never read raw spoiler-sensitive tables
--            directly, while validated RPCs can safely read gated windows
--            and record telemetry / rate-limit state under RLS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Core RPC: public.get_spoiler_safe_context
--    Enforces mathematical anti-spoiler boundary at the database layer:
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

  -- 1. Fetch Program & Episode metadata (and clamp playback to episode duration)
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
  where e.id = p_episode_id;

  -- Edge-Case Guard 3: Unknown episode ID returns safe empty context object
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
  p_playback_ms := least(v_safe_playback_ms, v_duration_ms);

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
    and sc.start_time_ms <= p_playback_ms
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
    and sc.start_time_ms <= p_playback_ms;

  -- 4. Fetch Strictly Bounded Transcript Segments within lookback window
  --    HARD INVARIANT: ts.end_time_ms <= p_playback_ms (never leak future lines!)
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
    and ts.end_time_ms <= p_playback_ms
    and ts.start_time_ms >= greatest(0, p_playback_ms - v_safe_lookback_ms);

  -- 5. Fetch Entities & Only Facts Revealed Up To p_playback_ms
  --    HARD INVARIANT: ea.reveal_time_ms <= p_playback_ms (prevents plot twist spoilers!)
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'slug', ent.slug,
      'name', ent.name,
      'type', ent.entity_type,
      'base_description', ent.base_description,
      'progressive_fact', ea.progressive_fact,
      'is_plot_twist', ea.is_plot_twist,
      'importance_rank', ea.importance_rank,
      'in_current_scene', (p_playback_ms between ea.start_time_ms and ea.end_time_ms)
    ) order by ea.importance_rank asc, ea.reveal_time_ms desc
  ), '[]'::jsonb)
  into v_unlocked_entities
  from public.entity_appearances ea
  join public.entities ent on ent.id = ea.entity_id
  where ea.episode_id = p_episode_id
    and ea.reveal_time_ms <= p_playback_ms
    and ent.spoiler_floor_ms <= p_playback_ms;

  -- 6. Fetch Unlocked Entity Relationships up to p_playback_ms
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
    and er.reveal_time_ms <= p_playback_ms
    and er.valid_from_ms <= p_playback_ms
    and (er.valid_until_ms is null or er.valid_until_ms >= p_playback_ms);

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
--    ts.end_time_ms <= p_playback_ms.
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
  v_safe_playback_ms bigint := greatest(0, coalesce(p_playback_ms, 0));
  v_safe_limit integer := greatest(1, least(coalesce(p_limit, 8), 25));
  v_clean_query text := btrim(coalesce(p_search_query, ''));
  v_results jsonb;
begin
  if v_clean_query = '' then
    return '[]'::jsonb;
  end if;

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
      and ts.end_time_ms <= p_playback_ms
      and ts.end_time_ms <= v_safe_playback_ms
      and (
        ts.search_vector @@ websearch_to_tsquery('english', v_clean_query)
        or ts.dialogue_text % v_clean_query
        or ts.dialogue_text ilike ('%' || v_clean_query || '%')
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
  v_safe_playback_ms bigint := greatest(0, coalesce(p_playback_ms, 0));
  v_safe_limit integer := greatest(1, least(coalesce(p_limit, 3), 10));
  v_quizzes jsonb;
begin
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
-- 4. RPC: public.get_or_touch_ai_cache
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
  update public.ai_response_cache
  set
    hit_count = hit_count + 1,
    last_accessed_at = now()
  where cache_key = p_cache_key
    and expires_at > now()
  returning response_payload into v_payload;

  return v_payload;
end;
$$;

comment on function public.get_or_touch_ai_cache(text) is
  'Atomically fetches an unexpired cached AI card by cache_key and increments hit_count.';

-- ----------------------------------------------------------------------------
-- 5. RPC: public.upsert_ai_response_cache
--    Inserts or updates a 15-second bucket AI response cache entry with TTL.
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
begin
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
    p_cache_key,
    p_episode_id,
    p_action_type,
    p_profile_mode,
    greatest(0, p_time_bucket_sec),
    p_provider_used,
    p_response_payload,
    p_origin_latency_ms,
    p_token_count,
    now() + make_interval(secs => greatest(60, coalesce(p_ttl_seconds, 86400))),
    now()
  )
  on conflict (cache_key) do update set
    response_payload = excluded.response_payload,
    provider_used = excluded.provider_used,
    origin_latency_ms = excluded.origin_latency_ms,
    token_count = excluded.token_count,
    expires_at = excluded.expires_at,
    last_accessed_at = now();
end;
$$;

comment on function public.upsert_ai_response_cache(text, uuid, text, household_profile_mode, integer, text, jsonb, integer, integer, integer) is
  'Upserts a structured AI response card into the 15-second temporal bucket cache with configurable TTL.';

-- ----------------------------------------------------------------------------
-- 6. RPC: public.check_device_rate_limit
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
  v_safe_window integer := greatest(10, coalesce(p_window_sec, 60));
  v_safe_max integer := greatest(1, coalesce(p_max_requests, 30));
  v_window_start timestamptz;
  v_current_count integer;
  v_allowed boolean;
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / v_safe_window) * v_safe_window
  );

  insert into public.device_rate_limits (device_id, window_start, request_count, blocked_count, last_request_at)
  values (coalesce(nullif(btrim(p_device_id), ''), 'anonymous-firetv'), v_window_start, 1, 0, now())
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
    'device_id', coalesce(nullif(btrim(p_device_id), ''), 'anonymous-firetv'),
    'current_count', v_current_count,
    'max_requests', v_safe_max,
    'remaining', greatest(0, v_safe_max - v_current_count),
    'window_reset_at', v_window_start + make_interval(secs => v_safe_window)
  );
end;
$$;

comment on function public.check_device_rate_limit(text, integer, integer) is
  'Enforces per-device request rate limits per time window to prevent LLM quota exhaustion.';

-- ----------------------------------------------------------------------------
-- 7. RPC: public.record_wisp_interaction
--    Atomically logs interaction_history, updates hourly ai_provider_metrics,
--    and increments profile usage counters in a single database transaction.
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
  v_bucket_hour timestamptz := date_trunc('hour', now());
  v_safe_latency integer := greatest(0, coalesce(p_latency_ms, 0));
  v_total_tokens integer := greatest(0, coalesce(p_prompt_tokens, 0) + coalesce(p_completion_tokens, 0));
begin
  -- 1. Insert interaction history record
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
    p_profile_id,
    p_episode_id,
    greatest(0, coalesce(p_playback_position_ms, 0)),
    p_action_type,
    coalesce(nullif(btrim(p_user_prompt), ''), p_action_type),
    p_ai_provider,
    v_safe_latency,
    coalesce(p_cache_hit, false),
    greatest(0, coalesce(p_prompt_tokens, 0)),
    greatest(0, coalesce(p_completion_tokens, 0)),
    p_error_code,
    coalesce(p_response_card, '{}'::jsonb)
  )
  returning id into v_interaction_id;

  -- 2. Upsert hourly AI provider telemetry metrics
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
    p_ai_provider,
    p_action_type,
    1,
    case when p_error_code is null then 1 else 0 end,
    case when p_error_code is not null then 1 else 0 end,
    case when p_cache_hit then 1 else 0 end,
    case when p_failover_triggered then 1 else 0 end,
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
    cache_hits = public.ai_provider_metrics.cache_hits + (case when p_cache_hit then 1 else 0 end),
    failover_count = public.ai_provider_metrics.failover_count + (case when p_failover_triggered then 1 else 0 end),
    total_latency_ms = public.ai_provider_metrics.total_latency_ms + v_safe_latency,
    min_latency_ms = least(coalesce(public.ai_provider_metrics.min_latency_ms, v_safe_latency), v_safe_latency),
    max_latency_ms = greatest(coalesce(public.ai_provider_metrics.max_latency_ms, v_safe_latency), v_safe_latency),
    total_tokens = public.ai_provider_metrics.total_tokens + v_total_tokens,
    updated_at = now();

  -- 3. Update profile activity counter if profile_id is supplied
  if p_profile_id is not null then
    update public.profiles
    set
      total_queries_count = total_queries_count + 1,
      last_active_at = now(),
      updated_at = now()
    where id = p_profile_id;
  end if;

  return v_interaction_id;
end;
$$;

comment on function public.record_wisp_interaction(uuid, uuid, bigint, text, text, text, integer, boolean, jsonb, integer, integer, boolean, text) is
  'SECURITY DEFINER transactional logger recording viewer interactions, updating hourly AI provider telemetry, and incrementing profile activity counters.';

-- ----------------------------------------------------------------------------
-- 8. Explicit RPC Execution Grants
-- ----------------------------------------------------------------------------
grant execute on function public.get_spoiler_safe_context(uuid, bigint, bigint) to anon, authenticated, service_role;
grant execute on function public.search_spoiler_safe_transcript(uuid, bigint, text, integer) to anon, authenticated, service_role;
grant execute on function public.get_episode_post_watch_quiz(uuid, bigint, household_profile_mode, integer) to anon, authenticated, service_role;
grant execute on function public.get_or_touch_ai_cache(text) to anon, authenticated, service_role;
grant execute on function public.upsert_ai_response_cache(text, uuid, text, household_profile_mode, integer, text, jsonb, integer, integer, integer) to anon, authenticated, service_role;
grant execute on function public.check_device_rate_limit(text, integer, integer) to anon, authenticated, service_role;
grant execute on function public.record_wisp_interaction(uuid, uuid, bigint, text, text, text, integer, boolean, jsonb, integer, integer, boolean, text) to anon, authenticated, service_role;
