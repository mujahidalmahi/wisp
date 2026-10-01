-- ============================================================================
-- Migration: 0004_analytics_views_and_observability.sql
-- Purpose:   Production Observability Views, Exact P50/P99 Latency
--            Percentiles, Scene Engagement Hotspots, Database Health RPC
--            & Automated Cache Maintenance.
-- Security:  All analytical views and observability/maintenance RPCs are
--            explicitly revoked from `PUBLIC, anon, authenticated` and
--            restricted to `service_role` (`assert_service_role_caller`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. View: public.v_episode_temporal_coverage
--    Provides real-time visibility into content curation depth across episodes.
-- ----------------------------------------------------------------------------
create or replace view public.v_episode_temporal_coverage as
select
  p.id as program_id,
  p.slug as program_slug,
  p.title as program_title,
  p.genre,
  e.id as episode_id,
  e.season_number,
  e.episode_number,
  e.title as episode_title,
  e.duration_ms,
  count(distinct sc.id) as scene_count,
  count(distinct ts.id) as transcript_segment_count,
  count(distinct ea.entity_id) as unique_entity_count,
  count(distinct ea.id) filter (where ea.is_plot_twist = true) as plot_twist_count,
  count(distinct er.id) as relationship_edge_count,
  count(distinct eq.id) as quiz_question_count,
  count(distinct te.id) as semantic_embedding_count,
  round(
    least(
      100.0,
      coalesce(
        (select sum(sc2.end_time_ms - sc2.start_time_ms)::numeric from public.scene_contexts sc2 where sc2.episode_id = e.id)
        / nullif(e.duration_ms::numeric, 0) * 100.0,
        0.0
      )
    ),
    2
  ) as timeline_coverage_pct
from public.episodes e
join public.programs p on p.id = e.program_id
left join public.scene_contexts sc on sc.episode_id = e.id
left join public.transcript_segments ts on ts.episode_id = e.id
left join public.entity_appearances ea on ea.episode_id = e.id
left join public.entity_relationships er on er.episode_id = e.id
left join public.episode_quizzes eq on eq.episode_id = e.id
left join public.temporal_embeddings te on te.episode_id = e.id
group by p.id, p.slug, p.title, p.genre, e.id, e.season_number, e.episode_number, e.title, e.duration_ms;

comment on view public.v_episode_temporal_coverage is
  'Summarizes scene, transcript, entity, plot-twist, relationship, quiz, and embedding coverage per episode.';

-- ----------------------------------------------------------------------------
-- 2. View: public.v_ai_provider_performance
--    Aggregates reliability, latency, cache hit rate, and failover metrics
--    across AI providers (Groq, Gemini, OpenRouter, Ollama).
-- ----------------------------------------------------------------------------
create or replace view public.v_ai_provider_performance as
select
  provider_name,
  action_type,
  sum(total_requests) as total_requests,
  sum(successful_requests) as successful_requests,
  sum(failed_requests) as failed_requests,
  sum(cache_hits) as cache_hits,
  sum(failover_count) as failover_count,
  round(
    (sum(successful_requests)::numeric / nullif(sum(total_requests)::numeric, 0)) * 100.0,
    2
  ) as success_rate_pct,
  round(
    (sum(cache_hits)::numeric / nullif(sum(total_requests)::numeric, 0)) * 100.0,
    2
  ) as cache_hit_rate_pct,
  round(
    sum(total_latency_ms)::numeric / nullif(sum(total_requests)::numeric, 0),
    1
  ) as avg_latency_ms,
  min(min_latency_ms) as min_latency_ms,
  max(max_latency_ms) as max_latency_ms,
  sum(total_tokens) as total_tokens_consumed,
  max(updated_at) as last_recorded_at
from public.ai_provider_metrics
group by provider_name, action_type;

comment on view public.v_ai_provider_performance is
  'Aggregates hourly AI provider request throughput, success rate %, cache hit rate %, failovers, and average latency.';

-- ----------------------------------------------------------------------------
-- 3. View: public.v_latency_percentiles_by_provider
--    Computes exact P50, P95, and P99 latency percentiles using PostgreSQL
--    ordered-set aggregates (percentile_cont) over interaction_history.
-- ----------------------------------------------------------------------------
create or replace view public.v_latency_percentiles_by_provider as
select
  ai_provider,
  action_type,
  count(*) as sample_size,
  round(avg(latency_ms)::numeric, 1) as mean_latency_ms,
  round(percentile_cont(0.50) within group (order by latency_ms)::numeric, 1) as p50_latency_ms,
  round(percentile_cont(0.95) within group (order by latency_ms)::numeric, 1) as p95_latency_ms,
  round(percentile_cont(0.99) within group (order by latency_ms)::numeric, 1) as p99_latency_ms,
  min(latency_ms) as min_latency_ms,
  max(latency_ms) as max_latency_ms
from public.interaction_history
where latency_ms is not null
group by ai_provider, action_type;

comment on view public.v_latency_percentiles_by_provider is
  'Computes exact P50, P95, and P99 response latency percentiles per AI provider and feature action type.';

-- ----------------------------------------------------------------------------
-- 4. View: public.v_scene_engagement_hotspots
--    Identifies which scenes trigger the most viewer questions on Fire TV.
-- ----------------------------------------------------------------------------
create or replace view public.v_scene_engagement_hotspots as
select
  e.id as episode_id,
  e.title as episode_title,
  sc.scene_index,
  sc.scene_title,
  sc.start_time_ms,
  sc.end_time_ms,
  count(ih.id) as total_viewer_queries,
  count(ih.id) filter (where ih.cache_hit = true) as cached_responses,
  round(avg(ih.latency_ms)::numeric, 1) as avg_response_latency_ms,
  coalesce(sum(ih.user_helpful_vote), 0) as net_helpful_score
from public.scene_contexts sc
join public.episodes e on e.id = sc.episode_id
left join public.interaction_history ih
  on ih.episode_id = sc.episode_id
  and ih.playback_position_ms between sc.start_time_ms and sc.end_time_ms
group by e.id, e.title, sc.scene_index, sc.scene_title, sc.start_time_ms, sc.end_time_ms;

comment on view public.v_scene_engagement_hotspots is
  'Ranks episode scenes by viewer query frequency, cache hit volume, average latency, and helpfulness score.';

-- ----------------------------------------------------------------------------
-- 5. View: public.v_cache_efficiency_summary
--    Tracks 15-second temporal bucket cache utilization and latency savings.
-- ----------------------------------------------------------------------------
create or replace view public.v_cache_efficiency_summary as
select
  count(*) as total_cached_buckets,
  count(*) filter (where expires_at > now()) as active_cached_buckets,
  count(*) filter (where expires_at <= now()) as expired_cached_buckets,
  coalesce(sum(hit_count), 0) as cumulative_cache_hits,
  coalesce(sum(hit_count * coalesce(origin_latency_ms, 350)), 0) as estimated_latency_saved_ms
from public.ai_response_cache;

comment on view public.v_cache_efficiency_summary is
  'Summarizes active vs. expired 15-second cache buckets, cumulative cache hits, and total latency saved.';

-- Restrict direct view reads to service_role so untrusted callers cannot bypass table RLS via views:
revoke all on table
  public.v_episode_temporal_coverage,
  public.v_ai_provider_performance,
  public.v_latency_percentiles_by_provider,
  public.v_scene_engagement_hotspots,
  public.v_cache_efficiency_summary
from public, anon, authenticated;

grant select on table
  public.v_episode_temporal_coverage,
  public.v_ai_provider_performance,
  public.v_latency_percentiles_by_provider,
  public.v_scene_engagement_hotspots,
  public.v_cache_efficiency_summary
to service_role;

-- ----------------------------------------------------------------------------
-- 6. Observability RPC: public.get_database_health_and_metrics (service_role)
--    Returns a single JSONB snapshot for /api/v1/health and monitoring tools.
-- ----------------------------------------------------------------------------
create or replace function public.get_database_health_and_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_catalog_stats jsonb;
  v_cache_stats jsonb;
  v_provider_stats jsonb;
  v_percentile_stats jsonb;
  v_spoiler_audit_stats jsonb;
begin
  perform public.assert_service_role_caller('get_database_health_and_metrics');

  select jsonb_build_object(
    'programs_count', (select count(*) from public.programs where is_active = true),
    'episodes_count', (select count(*) from public.episodes where is_published = true),
    'scenes_count', (select count(*) from public.scene_contexts),
    'transcript_segments_count', (select count(*) from public.transcript_segments),
    'entities_count', (select count(*) from public.entities),
    'entity_appearances_count', (select count(*) from public.entity_appearances),
    'entity_relationships_count', (select count(*) from public.entity_relationships),
    'episode_quizzes_count', (select count(*) from public.episode_quizzes),
    'temporal_embeddings_count', (select count(*) from public.temporal_embeddings),
    'profiles_count', (select count(*) from public.profiles)
  ) into v_catalog_stats;

  select to_jsonb(c.*)
  into v_cache_stats
  from public.v_cache_efficiency_summary c;

  select coalesce(jsonb_agg(to_jsonb(p.*)), '[]'::jsonb)
  into v_provider_stats
  from public.v_ai_provider_performance p;

  select coalesce(jsonb_agg(to_jsonb(lp.*)), '[]'::jsonb)
  into v_percentile_stats
  from public.v_latency_percentiles_by_provider lp;

  select jsonb_build_object(
    'total_audit_events', (select count(*) from public.spoiler_audit_log),
    'blocked_future_spoilers', (
      select count(*)
      from public.spoiler_audit_log
      where audit_event_type = 'blocked_future_spoiler'
    ),
    'malformed_spoiler_metadata_events', (
      select count(*)
      from public.spoiler_audit_log
      where audit_event_type = 'malformed_spoiler_metadata'
    ),
    'unverified_interactions', (
      select count(*)
      from public.interaction_history
      where spoiler_floor_verified = false
    )
  ) into v_spoiler_audit_stats;

  return jsonb_build_object(
    'status', 'healthy',
    'checked_at', now(),
    'catalog', v_catalog_stats,
    'cache_efficiency', coalesce(v_cache_stats, '{}'::jsonb),
    'ai_providers', v_provider_stats,
    'latency_percentiles', v_percentile_stats,
    'spoiler_safety_audit', v_spoiler_audit_stats
  );
end;
$$;

comment on function public.get_database_health_and_metrics() is
  'Backend-only (service_role) RPC returning a unified JSONB telemetry snapshot of catalog counts, cache efficiency, provider latency percentiles, and spoiler audits.';

-- ----------------------------------------------------------------------------
-- 7. Maintenance RPC: public.purge_expired_cache_and_rate_limits (service_role)
--    Cleans up expired AI cache buckets, expired sessions & stale rate windows.
-- ----------------------------------------------------------------------------
create or replace function public.purge_expired_cache_and_rate_limits()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_deleted_cache_rows integer;
  v_deleted_session_rows integer;
  v_deleted_rate_rows integer;
begin
  perform public.assert_service_role_caller('purge_expired_cache_and_rate_limits');

  delete from public.ai_response_cache
  where expires_at <= now();
  get diagnostics v_deleted_cache_rows = row_count;

  delete from public.conversation_sessions
  where expires_at <= now();
  get diagnostics v_deleted_session_rows = row_count;

  delete from public.device_rate_limits
  where window_start < (now() - interval '1 hour');
  get diagnostics v_deleted_rate_rows = row_count;

  return jsonb_build_object(
    'purged_cache_entries', v_deleted_cache_rows,
    'purged_conversation_sessions', v_deleted_session_rows,
    'purged_rate_limit_windows', v_deleted_rate_rows,
    'executed_at', now()
  );
end;
$$;

comment on function public.purge_expired_cache_and_rate_limits() is
  'Backend-only (service_role) maintenance procedure pruning expired AI cache buckets, expired viewing sessions, and stale rate-limit windows.';

revoke all on function public.get_database_health_and_metrics() from public, anon, authenticated;
grant execute on function public.get_database_health_and_metrics() to service_role;

revoke all on function public.purge_expired_cache_and_rate_limits() from public, anon, authenticated;
grant execute on function public.purge_expired_cache_and_rate_limits() to service_role;
