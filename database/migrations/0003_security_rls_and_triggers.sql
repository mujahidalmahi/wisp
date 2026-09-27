-- ============================================================================
-- Migration: 0003_security_rls_and_triggers.sql
-- Purpose: Row-Level Security (RLS) Policies on All 16 Production Tables,
--          Automated Timestamp Triggers, Episode Duration Boundary Enforcement
--          & Real-Time Spoiler Audit Triggers
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enable Row-Level Security (RLS) on All 16 Production Tables
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.programs enable row level security;
alter table public.episodes enable row level security;
alter table public.scene_contexts enable row level security;
alter table public.transcript_segments enable row level security;
alter table public.entities enable row level security;
alter table public.entity_appearances enable row level security;
alter table public.entity_relationships enable row level security;
alter table public.episode_quizzes enable row level security;
alter table public.temporal_embeddings enable row level security;
alter table public.conversation_sessions enable row level security;
alter table public.ai_response_cache enable row level security;
alter table public.interaction_history enable row level security;
alter table public.ai_provider_metrics enable row level security;
alter table public.device_rate_limits enable row level security;
alter table public.spoiler_audit_log enable row level security;

-- ----------------------------------------------------------------------------
-- 2. Granular Row-Level Security Policies (Idempotent)
-- ----------------------------------------------------------------------------

-- 2.1 Public Read-Only Catalog & Temporal Metadata Policies
drop policy if exists "Allow public read access on active programs" on public.programs;
create policy "Allow public read access on active programs"
  on public.programs for select
  using (is_active = true);

drop policy if exists "Allow public read access on published episodes" on public.episodes;
create policy "Allow public read access on published episodes"
  on public.episodes for select
  using (is_published = true);

drop policy if exists "Allow public read access on scene_contexts" on public.scene_contexts;
create policy "Allow public read access on scene_contexts"
  on public.scene_contexts for select
  using (true);

drop policy if exists "Allow public read access on transcript_segments" on public.transcript_segments;
create policy "Allow public read access on transcript_segments"
  on public.transcript_segments for select
  using (true);

drop policy if exists "Allow public read access on entities" on public.entities;
create policy "Allow public read access on entities"
  on public.entities for select
  using (true);

drop policy if exists "Allow public read access on entity_appearances" on public.entity_appearances;
create policy "Allow public read access on entity_appearances"
  on public.entity_appearances for select
  using (true);

drop policy if exists "Allow public read access on entity_relationships" on public.entity_relationships;
create policy "Allow public read access on entity_relationships"
  on public.entity_relationships for select
  using (true);

drop policy if exists "Allow public read access on episode_quizzes" on public.episode_quizzes;
create policy "Allow public read access on episode_quizzes"
  on public.episode_quizzes for select
  using (true);

drop policy if exists "Allow public read access on temporal_embeddings" on public.temporal_embeddings;
create policy "Allow public read access on temporal_embeddings"
  on public.temporal_embeddings for select
  using (true);

-- 2.2 Household Profiles, Conversation Sessions & Interaction History Policies
drop policy if exists "Allow read access on profiles" on public.profiles;
create policy "Allow read access on profiles"
  on public.profiles for select
  using (true);

drop policy if exists "Allow profile creation and mode updates" on public.profiles;
create policy "Allow profile creation and mode updates"
  on public.profiles for insert
  with check (char_length(btrim(device_id)) >= 3);

drop policy if exists "Allow profile updates by device" on public.profiles;
create policy "Allow profile updates by device"
  on public.profiles for update
  using (true)
  with check (char_length(btrim(device_id)) >= 3);

drop policy if exists "Allow read access on conversation_sessions" on public.conversation_sessions;
create policy "Allow read access on conversation_sessions"
  on public.conversation_sessions for select
  using (expires_at > now());

drop policy if exists "Allow upsert on conversation_sessions" on public.conversation_sessions;
create policy "Allow upsert on conversation_sessions"
  on public.conversation_sessions for insert
  with check (char_length(btrim(device_id)) >= 3);

drop policy if exists "Allow update on conversation_sessions" on public.conversation_sessions;
create policy "Allow update on conversation_sessions"
  on public.conversation_sessions for update
  using (true)
  with check (char_length(btrim(device_id)) >= 3);

drop policy if exists "Allow read access on interaction_history" on public.interaction_history;
create policy "Allow read access on interaction_history"
  on public.interaction_history for select
  using (true);

drop policy if exists "Allow inserting interaction_history" on public.interaction_history;
create policy "Allow inserting interaction_history"
  on public.interaction_history for insert
  with check (playback_position_ms >= 0);

-- 2.3 Server-Side Cache, Telemetry, Rate Limits & Spoiler Audit Policies
drop policy if exists "Allow read access on ai_response_cache" on public.ai_response_cache;
create policy "Allow read access on ai_response_cache"
  on public.ai_response_cache for select
  using (expires_at > now());

drop policy if exists "Allow read access on ai_provider_metrics" on public.ai_provider_metrics;
create policy "Allow read access on ai_provider_metrics"
  on public.ai_provider_metrics for select
  using (true);

drop policy if exists "Allow read access on spoiler_audit_log" on public.spoiler_audit_log;
create policy "Allow read access on spoiler_audit_log"
  on public.spoiler_audit_log for select
  using (true);

-- ----------------------------------------------------------------------------
-- 3. Trigger Function: Automatic updated_at Timestamp Maintenance
-- ----------------------------------------------------------------------------
create or replace function public.trg_fn_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.trg_fn_set_updated_at();

drop trigger if exists trg_programs_updated_at on public.programs;
create trigger trg_programs_updated_at
  before update on public.programs
  for each row execute function public.trg_fn_set_updated_at();

drop trigger if exists trg_episodes_updated_at on public.episodes;
create trigger trg_episodes_updated_at
  before update on public.episodes
  for each row execute function public.trg_fn_set_updated_at();

drop trigger if exists trg_scene_contexts_updated_at on public.scene_contexts;
create trigger trg_scene_contexts_updated_at
  before update on public.scene_contexts
  for each row execute function public.trg_fn_set_updated_at();

drop trigger if exists trg_entities_updated_at on public.entities;
create trigger trg_entities_updated_at
  before update on public.entities
  for each row execute function public.trg_fn_set_updated_at();

drop trigger if exists trg_conversation_sessions_updated_at on public.conversation_sessions;
create trigger trg_conversation_sessions_updated_at
  before update on public.conversation_sessions
  for each row execute function public.trg_fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Trigger Function: Episode Duration Temporal Boundary Validation
--    Prevents inserting or updating any scene, transcript line, entity
--    appearance, or embedding whose timestamp exceeds episode.duration_ms.
-- ----------------------------------------------------------------------------
create or replace function public.trg_fn_validate_episode_temporal_bounds()
returns trigger
language plpgsql
as $$
declare
  v_episode_duration_ms bigint;
begin
  select duration_ms
  into v_episode_duration_ms
  from public.episodes
  where id = new.episode_id;

  if v_episode_duration_ms is not null then
    if new.end_time_ms > v_episode_duration_ms then
      raise exception 'Temporal boundary violation on table %: end_time_ms (%) exceeds episode duration_ms (%)',
        tg_table_name, new.end_time_ms, v_episode_duration_ms;
    end if;

    if tg_table_name in ('entity_appearances', 'temporal_embeddings') and new.reveal_time_ms > v_episode_duration_ms then
      raise exception 'Temporal boundary violation on %: reveal_time_ms (%) exceeds episode duration_ms (%)',
        tg_table_name, new.reveal_time_ms, v_episode_duration_ms;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_scene_contexts_bounds on public.scene_contexts;
create trigger trg_scene_contexts_bounds
  before insert or update on public.scene_contexts
  for each row execute function public.trg_fn_validate_episode_temporal_bounds();

drop trigger if exists trg_transcript_segments_bounds on public.transcript_segments;
create trigger trg_transcript_segments_bounds
  before insert or update on public.transcript_segments
  for each row execute function public.trg_fn_validate_episode_temporal_bounds();

drop trigger if exists trg_entity_appearances_bounds on public.entity_appearances;
create trigger trg_entity_appearances_bounds
  before insert or update on public.entity_appearances
  for each row execute function public.trg_fn_validate_episode_temporal_bounds();

drop trigger if exists trg_temporal_embeddings_bounds on public.temporal_embeddings;
create trigger trg_temporal_embeddings_bounds
  before insert or update on public.temporal_embeddings
  for each row execute function public.trg_fn_validate_episode_temporal_bounds();

-- ----------------------------------------------------------------------------
-- 5. Trigger Function: Real-Time Interaction Spoiler Audit Guard
--    Inspects response_card->>'spoilerSafeUpToMs' before inserting into
--    interaction_history. If a response claims a timestamp beyond
--    playback_position_ms, it clamps the value and logs a spoiler audit event.
-- ----------------------------------------------------------------------------
create or replace function public.trg_fn_enforce_interaction_spoiler_gate()
returns trigger
language plpgsql
as $$
declare
  v_card_spoiler_ms bigint;
begin
  if new.response_card ? 'spoilerSafeUpToMs' then
    v_card_spoiler_ms := (new.response_card->>'spoilerSafeUpToMs')::bigint;

    if v_card_spoiler_ms > new.playback_position_ms then
      new.spoiler_floor_verified := false;
      new.response_card := jsonb_set(
        new.response_card,
        '{spoilerSafeUpToMs}',
        to_jsonb(new.playback_position_ms)
      );

      insert into public.spoiler_audit_log (
        episode_id,
        requested_playback_ms,
        blocked_item_timestamp_ms,
        audit_event_type,
        source_rpc,
        details
      )
      values (
        new.episode_id,
        new.playback_position_ms,
        v_card_spoiler_ms,
        'blocked_future_spoiler',
        'trg_fn_enforce_interaction_spoiler_gate',
        jsonb_build_object(
          'action_type', new.action_type,
          'ai_provider', new.ai_provider,
          'clamped_to_ms', new.playback_position_ms
        )
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_interaction_spoiler_gate on public.interaction_history;
create trigger trg_interaction_spoiler_gate
  before insert on public.interaction_history
  for each row execute function public.trg_fn_enforce_interaction_spoiler_gate();
