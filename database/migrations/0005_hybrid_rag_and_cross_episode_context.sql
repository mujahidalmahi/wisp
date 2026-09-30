-- ============================================================================
-- Migration: 0005_hybrid_rag_and_cross_episode_context.sql
-- Purpose:   Advanced Database RPC Capabilities for Wisp:
--              1. Pure-SQL Parallel-Safe Vector Cosine Similarity Function
--              2. Hybrid Reciprocal Rank Fusion (RRF) Spoiler-Safe RAG Search
--              3. Cross-Episode / Multi-Season Spoiler Boundary Resolution
--              4. Single-Roundtrip Fire TV Stage-1 Drawer Bootstrap RPC
-- Security:
--   * All RPCs use a locked `SET search_path = public`.
--   * All temporal RPCs enforce `e.is_published = true AND p.is_active = true`
--     and clamp `p_playback_ms` to `[0, e.duration_ms]`.
--   * `get_firetv_stage1_bootstrap` only returns private device profile and
--     session state when invoked by `service_role` or when `p_device_id`
--     matches the caller's verified `public.current_trusted_device_id()` claim.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Function: public.cosine_similarity_float4(p_vec_a, p_vec_b)
--    Computes (A · B) / (||A|| * ||B||) over native float4[] arrays.
--    Marked IMMUTABLE, PARALLEL SAFE, and STRICT so the PostgreSQL query
--    planner can parallelize semantic vector scoring across CPU workers.
-- ----------------------------------------------------------------------------
create or replace function public.cosine_similarity_float4(
  p_vec_a float4[],
  p_vec_b float4[]
)
returns float8
language plpgsql
immutable
parallel safe
strict
set search_path = public
as $$
declare
  v_len integer := least(cardinality(p_vec_a), cardinality(p_vec_b));
  v_dot float8 := 0.0;
  v_norm_a float8 := 0.0;
  v_norm_b float8 := 0.0;
  i integer;
begin
  -- Guard against empty vectors
  if v_len is null or v_len = 0 then
    return 0.0;
  end if;

  -- Accumulate dot product and L2 norms
  for i in 1..v_len loop
    v_dot := v_dot + (p_vec_a[i]::float8 * p_vec_b[i]::float8);
    v_norm_a := v_norm_a + (p_vec_a[i]::float8 * p_vec_a[i]::float8);
    v_norm_b := v_norm_b + (p_vec_b[i]::float8 * p_vec_b[i]::float8);
  end loop;

  -- Guard against zero-magnitude vectors (division by zero protection)
  if v_norm_a <= 0.0 or v_norm_b <= 0.0 then
    return 0.0;
  end if;

  return v_dot / (sqrt(v_norm_a) * sqrt(v_norm_b));
end;
$$;

comment on function public.cosine_similarity_float4(float4[], float4[]) is
  'Computes normalized cosine similarity between two float4[] embedding vectors (parallel-safe, zero C-extension lock-in).';

-- ----------------------------------------------------------------------------
-- 2. RPC: public.hybrid_spoiler_safe_rag_search
--    Combines Lexical Full-Text Search (tsvector) + Trigram Similarity (pg_trgm)
--    + Semantic Vector Cosine Similarity using Reciprocal Rank Fusion (RRF):
--      RRF_Score(d) = 1 / (60 + rank_lexical) + 1 / (60 + rank_semantic)
--    Strictly enforces end_time_ms <= p_playback_ms & reveal_time_ms <= p_playback_ms.
-- ----------------------------------------------------------------------------
create or replace function public.hybrid_spoiler_safe_rag_search(
  p_episode_id uuid,
  p_playback_ms bigint,
  p_query_text text,
  p_query_vector float4[] default null,
  p_limit integer default 6
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
  v_safe_limit integer := greatest(1, least(coalesce(p_limit, 6), 20));
  v_clean_query text := btrim(coalesce(p_query_text, ''));
  v_results jsonb;
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
      'id', fused.id,
      'source_type', fused.source_type,
      'start_time_ms', fused.start_time_ms,
      'end_time_ms', fused.end_time_ms,
      'reveal_time_ms', fused.reveal_time_ms,
      'content_text', fused.content_text,
      'lexical_score', round(fused.lex_score::numeric, 4),
      'semantic_score', round(fused.vec_score::numeric, 4),
      'rrf_fusion_score', round(fused.rrf_score::numeric, 5)
    )
  ), '[]'::jsonb)
  into v_results
  from (
    -- Step 1: Hard Anti-Spoiler Temporal Gate before scoring
    with spoiler_gated_candidates as (
      select
        te.id,
        te.source_type,
        te.start_time_ms,
        te.end_time_ms,
        te.reveal_time_ms,
        te.content_text,
        case
          when v_clean_query = '' then 0.0
          else coalesce(ts_rank_cd(te.search_vector, websearch_to_tsquery('english', v_clean_query)), 0.0)
               + coalesce(similarity(te.content_text, v_clean_query), 0.0)
        end as lex_score,
        case
          when p_query_vector is null or cardinality(p_query_vector) = 0 then 0.0
          else greatest(0.0, public.cosine_similarity_float4(te.embedding_vector, p_query_vector))
        end as vec_score
      from public.temporal_embeddings te
      where te.episode_id = p_episode_id
        and te.end_time_ms <= v_safe_playback_ms
        and te.reveal_time_ms <= v_safe_playback_ms
    ),
    -- Step 2A: Rank only documents with a positive lexical match
    lex_ranked as (
      select
        id,
        row_number() over (order by lex_score desc, start_time_ms desc) as rank_lex
      from spoiler_gated_candidates
      where lex_score > 0.0
    ),
    -- Step 2B: Rank only documents with a positive semantic match
    vec_ranked as (
      select
        id,
        row_number() over (order by vec_score desc, start_time_ms desc) as rank_vec
      from spoiler_gated_candidates
      where vec_score > 0.0
    ),
    -- Step 3: Reciprocal Rank Fusion combining only active arm terms
    fused_candidates as (
      select
        c.id,
        c.source_type,
        c.start_time_ms,
        c.end_time_ms,
        c.reveal_time_ms,
        c.content_text,
        c.lex_score,
        c.vec_score,
        coalesce(1.0 / (60.0 + l.rank_lex), 0.0) +
        coalesce(1.0 / (60.0 + v.rank_vec), 0.0) as rrf_score
      from spoiler_gated_candidates c
      left join lex_ranked l on l.id = c.id
      left join vec_ranked v on v.id = c.id
      where l.rank_lex is not null or v.rank_vec is not null
    )
    select
      fc.id,
      fc.source_type,
      fc.start_time_ms,
      fc.end_time_ms,
      fc.reveal_time_ms,
      fc.content_text,
      fc.lex_score,
      fc.vec_score,
      fc.rrf_score
    from fused_candidates fc
    order by fc.rrf_score desc, fc.end_time_ms desc
    limit v_safe_limit
  ) fused;

  return v_results;
end;
$$;

comment on function public.hybrid_spoiler_safe_rag_search(uuid, bigint, text, float4[], integer) is
  'Hybrid Reciprocal Rank Fusion (RRF) SECURITY DEFINER search combining Full-Text, Trigram, and Semantic Vector similarity strictly bounded by playback_position_ms.';

-- ----------------------------------------------------------------------------
-- 3. RPC: public.get_cross_episode_spoiler_safe_context
--    Enables multi-episode / full-season recall without leaking future episodes:
--      * Unlocks 100% of completed published prior episodes (< S, or = S and < E)
--      * Unlocks 0..p_playback_ms of the active published episode (S, E)
--      * Blocks 100% of future episodes (> S, or = S and > E)
-- ----------------------------------------------------------------------------
create or replace function public.get_cross_episode_spoiler_safe_context(
  p_episode_id uuid,
  p_playback_ms bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_program_id uuid;
  v_season_num integer;
  v_episode_num integer;
  v_safe_playback_ms bigint := greatest(0, coalesce(p_playback_ms, 0));
  v_prior_episodes_recap jsonb;
  v_current_episode_context jsonb;
begin
  -- Resolve the active parent program, season number, and published episode number
  select e.program_id, e.season_number, e.episode_number
  into v_program_id, v_season_num, v_episode_num
  from public.episodes e
  join public.programs p on p.id = e.program_id
  where e.id = p_episode_id
    and e.is_published = true
    and p.is_active = true;

  if v_program_id is null then
    return jsonb_build_object(
      'found', false,
      'prior_episodes', '[]'::jsonb,
      'current_episode', '{}'::jsonb
    );
  end if;

  -- 1. Gather summaries from strictly completed, published prior episodes in the same program
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'episode_id', ep.id,
      'season_number', ep.season_number,
      'episode_number', ep.episode_number,
      'title', ep.title,
      'summary', ep.summary
    ) order by ep.season_number asc, ep.episode_number asc
  ), '[]'::jsonb)
  into v_prior_episodes_recap
  from public.episodes ep
  where ep.program_id = v_program_id
    and ep.is_published = true
    and (
      ep.season_number < v_season_num
      or (ep.season_number = v_season_num and ep.episode_number < v_episode_num)
    );

  -- 2. Delegate current episode temporal windowing to get_spoiler_safe_context
  v_current_episode_context := public.get_spoiler_safe_context(
    p_episode_id,
    v_safe_playback_ms,
    180000
  );

  return jsonb_build_object(
    'found', true,
    'program_id', v_program_id,
    'current_season', v_season_num,
    'current_episode_number', v_episode_num,
    'prior_episodes', v_prior_episodes_recap,
    'current_episode', v_current_episode_context
  );
end;
$$;

comment on function public.get_cross_episode_spoiler_safe_context(uuid, bigint) is
  'Multi-episode SECURITY DEFINER context resolver unlocking completed prior episodes and current episode up to playback_ms while blocking future episodes.';

-- ----------------------------------------------------------------------------
-- 4. RPC: public.get_firetv_stage1_bootstrap
--    Single-roundtrip Fire TV Stage-1 Instant Drawer Bootstrap RPC.
--    Fetches the active scene (via O(log N) GiST time_range containment),
--    D-pad quick_action_chips, and pre-warmed bucket cache cards.
--    Tenant-scoped data (`profiles` and `conversation_sessions`) is returned
--    only when invoked by `service_role` or when `p_device_id` matches the
--    caller's verified `public.current_trusted_device_id()` claim.
--    Profile selection is deterministic and claim-bound (`p_profile_id` or JWT claim).
-- ----------------------------------------------------------------------------
drop function if exists public.get_firetv_stage1_bootstrap(uuid, text, bigint);

create or replace function public.get_firetv_stage1_bootstrap(
  p_episode_id uuid,
  p_device_id text,
  p_playback_ms bigint,
  p_profile_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_duration_ms bigint;
  v_default_bucket_sec integer := 15;
  v_safe_playback_ms bigint := greatest(0, coalesce(p_playback_ms, 0));
  v_bucket_sec integer;
  v_clean_device_id text := nullif(btrim(p_device_id), '');
  v_trusted_device_id text := public.current_trusted_device_id();
  v_trusted_profile_id uuid := public.current_trusted_profile_id();
  v_is_service_caller boolean := public.is_service_role_caller();
  v_can_read_device_state boolean := false;
  v_target_profile_id uuid := null;
  v_profile jsonb := null;
  v_active_scene jsonb := null;
  v_prewarmed_cards jsonb := '[]'::jsonb;
  v_session jsonb := null;
begin
  -- Verify episode is published and active, and clamp playback position to duration_ms
  select e.duration_ms, coalesce(e.default_bucket_sec, 15)
  into v_duration_ms, v_default_bucket_sec
  from public.episodes e
  join public.programs p on p.id = e.program_id
  where e.id = p_episode_id
    and e.is_published = true
    and p.is_active = true;

  if v_duration_ms is null then
    return jsonb_build_object(
      'found', false,
      'episode_id', p_episode_id,
      'playback_position_ms', v_safe_playback_ms,
      'profile', '{"mode": "quick_glance"}'::jsonb,
      'active_scene', '{}'::jsonb,
      'prewarmed_cards', '[]'::jsonb,
      'session', '{}'::jsonb
    );
  end if;

  v_safe_playback_ms := least(v_safe_playback_ms, v_duration_ms);
  v_bucket_sec := floor(greatest(0, v_safe_playback_ms - 1)::numeric / (v_default_bucket_sec * 1000.0))::integer * v_default_bucket_sec;

  v_can_read_device_state := (
    v_clean_device_id is not null
    and (
      v_is_service_caller
      or (v_trusted_device_id is not null and v_clean_device_id = v_trusted_device_id)
    )
  );

  -- 1. Deterministic & Claim-Bound Household Profile Resolution
  if v_can_read_device_state then
    if v_trusted_profile_id is not null then
      v_target_profile_id := v_trusted_profile_id;
    elsif p_profile_id is not null then
      v_target_profile_id := p_profile_id;
    end if;

    if v_target_profile_id is not null then
      select jsonb_build_object(
        'id', pr.id,
        'display_name', pr.display_name,
        'mode', pr.mode,
        'spoiler_strictness', pr.spoiler_strictness,
        'voice_tts_enabled', pr.voice_tts_enabled
      )
      into v_profile
      from public.profiles pr
      where pr.id = v_target_profile_id
        and (v_is_service_caller or pr.device_id = v_clean_device_id);
    else
      select jsonb_build_object(
        'id', pr.id,
        'display_name', pr.display_name,
        'mode', pr.mode,
        'spoiler_strictness', pr.spoiler_strictness,
        'voice_tts_enabled', pr.voice_tts_enabled
      )
      into v_profile
      from public.profiles pr
      where pr.device_id = v_clean_device_id
      order by pr.last_active_at desc, pr.id asc
      limit 1;
    end if;

    if v_profile is not null and (v_profile ? 'id') then
      v_target_profile_id := (v_profile->>'id')::uuid;
    end if;
  end if;

  -- 2. O(log N) GiST time_range containment lookup (<@) for the Active Scene
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
    and v_safe_playback_ms <@ sc.time_range
  order by sc.scene_index desc
  limit 1;

  -- Fallback if playback_ms sits in an inter-scene transition gap or past final scene
  if v_active_scene is null then
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
    order by sc.start_time_ms desc
    limit 1;
  end if;

  -- 3. Fetch pre-warmed cached AI cards for this episode & bucket.
  --    Strictly enforces that every card has a valid non-negative numeric spoilerSafeUpToMs
  --    that is <= v_safe_playback_ms; cards with missing, non-numeric, negative, or
  --    future boundaries are strictly excluded.
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'action_type', c.action_type,
      'profile_mode', c.profile_mode,
      'card', c.response_payload
    )
  ), '[]'::jsonb)
  into v_prewarmed_cards
  from public.ai_response_cache c
  where c.episode_id = p_episode_id
    and c.time_bucket_sec = v_bucket_sec
    and c.expires_at > now()
    and jsonb_typeof(c.response_payload) = 'object'
    and (c.response_payload ? 'spoilerSafeUpToMs')
    and jsonb_typeof(c.response_payload->'spoilerSafeUpToMs') in ('number', 'string')
    and btrim(c.response_payload->>'spoilerSafeUpToMs') ~ '^[0-9]{1,18}$'
    and (btrim(c.response_payload->>'spoilerSafeUpToMs'))::bigint between 0 and v_safe_playback_ms;

  -- 4. Fetch active multi-turn conversation session & bookmarks ONLY if caller is authorized for p_device_id
  --    Deterministically matched to v_target_profile_id if resolved
  if v_can_read_device_state then
    select jsonb_build_object(
      'session_id', cs.id,
      'turn_count', cs.turn_count,
      'recent_turns', cs.recent_turns,
      'bookmarked_moments', cs.bookmarked_moments
    )
    into v_session
    from public.conversation_sessions cs
    where cs.device_id = v_clean_device_id
      and cs.episode_id = p_episode_id
      and (v_target_profile_id is null or cs.profile_id is null or cs.profile_id = v_target_profile_id)
      and cs.expires_at > now()
    order by (case when cs.profile_id = v_target_profile_id then 0 else 1 end) asc,
             cs.updated_at desc
    limit 1;
  end if;

  return jsonb_build_object(
    'found', true,
    'episode_id', p_episode_id,
    'playback_position_ms', v_safe_playback_ms,
    'time_bucket_sec', v_bucket_sec,
    'profile', coalesce(v_profile, '{"mode": "quick_glance"}'::jsonb),
    'active_scene', coalesce(v_active_scene, '{}'::jsonb),
    'prewarmed_cards', v_prewarmed_cards,
    'session', coalesce(v_session, '{}'::jsonb)
  );
end;
$$;

comment on function public.get_firetv_stage1_bootstrap(uuid, text, bigint, uuid) is
  'Single-roundtrip SECURITY DEFINER Fire TV Stage-1 overlay bootstrap returning active scene, D-pad chips, strictly verified pre-warmed cache cards, and claim-bound profile/session state.';

revoke all on function public.cosine_similarity_float4(float4[], float4[]) from public;
grant execute on function public.cosine_similarity_float4(float4[], float4[]) to anon, authenticated, service_role;

revoke all on function public.hybrid_spoiler_safe_rag_search(uuid, bigint, text, float4[], integer) from public;
grant execute on function public.hybrid_spoiler_safe_rag_search(uuid, bigint, text, float4[], integer) to anon, authenticated, service_role;

revoke all on function public.get_cross_episode_spoiler_safe_context(uuid, bigint) from public;
grant execute on function public.get_cross_episode_spoiler_safe_context(uuid, bigint) to anon, authenticated, service_role;

revoke all on function public.get_firetv_stage1_bootstrap(uuid, text, bigint, uuid) from public;
grant execute on function public.get_firetv_stage1_bootstrap(uuid, text, bigint, uuid) to anon, authenticated, service_role;
