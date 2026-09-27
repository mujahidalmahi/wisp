-- ============================================================================
-- Migration: 0005_hybrid_rag_and_cross_episode_context.sql
-- Purpose:   Advanced Database RPC Capabilities for Wisp:
--              1. Pure-SQL Parallel-Safe Vector Cosine Similarity Function
--              2. Hybrid Reciprocal Rank Fusion (RRF) Spoiler-Safe RAG Search
--              3. Cross-Episode / Multi-Season Spoiler Boundary Resolution
--              4. Single-Roundtrip Fire TV Stage-1 Drawer Bootstrap RPC
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
as $$
declare
  v_safe_playback_ms bigint := greatest(0, coalesce(p_playback_ms, 0));
  v_safe_limit integer := greatest(1, least(coalesce(p_limit, 6), 20));
  v_clean_query text := btrim(coalesce(p_query_text, ''));
  v_results jsonb;
begin
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
    -- Step 2: Compute independent rank positions for Lexical and Vector arms
    ranked_candidates as (
      select
        c.*,
        row_number() over (order by c.lex_score desc, c.start_time_ms desc) as rank_lex,
        row_number() over (order by c.vec_score desc, c.start_time_ms desc) as rank_vec
      from spoiler_gated_candidates c
      where c.lex_score > 0.0 or c.vec_score > 0.0
    )
    -- Step 3: Fuse rankings via Reciprocal Rank Fusion (k = 60)
    select
      rc.*,
      (1.0 / (60.0 + rc.rank_lex)) + (1.0 / (60.0 + rc.rank_vec)) as rrf_score
    from ranked_candidates rc
    order by rrf_score desc, rc.end_time_ms desc
    limit v_safe_limit
  ) fused;

  return v_results;
end;
$$;

comment on function public.hybrid_spoiler_safe_rag_search(uuid, bigint, text, float4[], integer) is
  'Hybrid Reciprocal Rank Fusion (RRF) search combining Full-Text, Trigram, and Semantic Vector similarity strictly bounded by playback_position_ms.';

-- ----------------------------------------------------------------------------
-- 3. RPC: public.get_cross_episode_spoiler_safe_context
--    Enables multi-episode / full-season recall without leaking future episodes:
--      * Unlocks 100% of completed prior episodes (< S, or = S and < E)
--      * Unlocks 0..p_playback_ms of the active episode (S, E)
--      * Blocks 100% of future episodes (> S, or = S and > E)
-- ----------------------------------------------------------------------------
create or replace function public.get_cross_episode_spoiler_safe_context(
  p_episode_id uuid,
  p_playback_ms bigint
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_program_id uuid;
  v_season_num integer;
  v_episode_num integer;
  v_safe_playback_ms bigint := greatest(0, coalesce(p_playback_ms, 0));
  v_prior_episodes_recap jsonb;
  v_current_episode_context jsonb;
begin
  -- Resolve the parent program, season number, and episode number
  select e.program_id, e.season_number, e.episode_number
  into v_program_id, v_season_num, v_episode_num
  from public.episodes e
  where e.id = p_episode_id;

  if v_program_id is null then
    return jsonb_build_object(
      'found', false,
      'prior_episodes', '[]'::jsonb,
      'current_episode', '{}'::jsonb
    );
  end if;

  -- 1. Gather summaries from strictly completed prior episodes in the same program
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
  'Multi-episode context resolver unlocking completed prior episodes and current episode up to playback_ms while blocking future episodes.';

-- ----------------------------------------------------------------------------
-- 4. RPC: public.get_firetv_stage1_bootstrap
--    Single-roundtrip Fire TV Stage-1 Instant Drawer Bootstrap RPC.
--    Fetches the active household profile, active scene (via O(log N) GiST
--    time_range containment), D-pad quick_action_chips, pre-warmed bucket
--    cache cards, and conversation session memory in one database call.
-- ----------------------------------------------------------------------------
create or replace function public.get_firetv_stage1_bootstrap(
  p_episode_id uuid,
  p_device_id text,
  p_playback_ms bigint
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_safe_playback_ms bigint := greatest(0, coalesce(p_playback_ms, 0));
  v_bucket_sec integer := floor(greatest(0, coalesce(p_playback_ms, 0)) / 15000.0) * 15;
  v_profile jsonb;
  v_active_scene jsonb;
  v_prewarmed_cards jsonb;
  v_session jsonb;
begin
  -- 1. Resolve most recently active household profile for the Fire TV device
  select jsonb_build_object(
    'id', pr.id,
    'display_name', pr.display_name,
    'mode', pr.mode,
    'spoiler_strictness', pr.spoiler_strictness,
    'voice_tts_enabled', pr.voice_tts_enabled
  )
  into v_profile
  from public.profiles pr
  where pr.device_id = p_device_id
  order by pr.last_active_at desc
  limit 1;

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

  -- 3. Fetch any pre-warmed cached AI cards for this episode & 15-second bucket
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
    and c.expires_at > now();

  -- 4. Fetch active multi-turn conversation session & bookmarked moments
  select jsonb_build_object(
    'session_id', cs.id,
    'turn_count', cs.turn_count,
    'recent_turns', cs.recent_turns,
    'bookmarked_moments', cs.bookmarked_moments
  )
  into v_session
  from public.conversation_sessions cs
  where cs.device_id = p_device_id
    and cs.episode_id = p_episode_id
    and cs.expires_at > now()
  limit 1;

  return jsonb_build_object(
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

comment on function public.get_firetv_stage1_bootstrap(uuid, text, bigint) is
  'Single-roundtrip Fire TV Stage-1 overlay bootstrap returning profile, active scene, D-pad chips, pre-warmed cache cards, and session state.';
