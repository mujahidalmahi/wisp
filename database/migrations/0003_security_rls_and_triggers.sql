-- ============================================================================
-- Migration: 0003_security_rls_and_triggers.sql
-- Purpose:   1. Idempotent Forward Upgrade Backfill (ensuring any deployment
--               where legacy 0001/0002 were already marked applied still
--               receives all new columns, generated fields, and tables).
--            2. Strict Anti-Spoiler Row-Level Security (RLS) Policies on all
--               16 tables (no open USING (true) public reads on spoiler tables;
--               revoked direct untrusted writes; server-trusted playback gate).
--            3. Automated updated_at Timestamp Maintenance Triggers.
--            4.双向 (Bidirectional) Episode Duration Boundary Enforcement:
--               - Child INSERT/UPDATE trigger (trg_fn_validate_episode_temporal_bounds)
--               - Parent Episode duration_ms shrink guard (trg_fn_prevent_unsafe_episode_duration_shrink)
--            5. Fault-Tolerant Real-Time Interaction Spoiler Audit Trigger
--               (validates JSON type/numeric format before bigint cast).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Idempotent Forward-Migration Guard for Pre-Existing Deployments
--    Ensures that if a migration runner skipped 0001 because a legacy 0001
--    was already recorded, all new columns, generated columns, constraints,
--    and tables exist before RLS policies, triggers, and views are applied.
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";
create extension if not exists "btree_gist";

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

alter table if exists public.profiles
  add column if not exists preferred_language text not null default 'en',
  add column if not exists voice_tts_enabled boolean not null default true,
  add column if not exists auto_pause_on_overlay boolean not null default false,
  add column if not exists parental_pin_hash text,
  add column if not exists total_queries_count bigint not null default 0,
  add column if not exists last_active_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.programs
  add column if not exists content_advisories text[] not null default '{}'::text[],
  add column if not exists original_language text not null default 'en',
  add column if not exists total_seasons integer not null default 1,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.episodes
  add column if not exists intro_end_ms bigint not null default 0,
  add column if not exists credits_start_ms bigint,
  add column if not exists default_bucket_sec integer not null default 15,
  add column if not exists subtitle_vtt_url text,
  add column if not exists thumbnail_sprite_url text,
  add column if not exists is_published boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.scene_contexts
  add column if not exists time_range int8range
    generated always as (int8range(start_time_ms, end_time_ms, '[]')) stored,
  add column if not exists mood_tag text not null default 'narrative',
  add column if not exists narrative_tension_score smallint not null default 5,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.transcript_segments
  add column if not exists time_range int8range
    generated always as (int8range(start_time_ms, end_time_ms, '[]')) stored,
  add column if not exists confidence_score numeric(4,3) not null default 1.000,
  add column if not exists is_key_plot_point boolean not null default false,
  add column if not exists search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(speaker_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(dialogue_text, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(visual_cue, '')), 'C')
  ) stored;

alter table if exists public.entities
  add column if not exists aliases text[] not null default '{}'::text[],
  add column if not exists spoiler_floor_ms bigint not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.entity_appearances
  add column if not exists is_plot_twist boolean not null default false,
  add column if not exists importance_rank smallint not null default 1;

alter table if exists public.ai_response_cache
  add column if not exists hit_count bigint not null default 0,
  add column if not exists origin_latency_ms integer,
  add column if not exists token_count integer,
  add column if not exists expires_at timestamptz not null default (now() + interval '24 hours'),
  add column if not exists last_accessed_at timestamptz not null default now();

alter table if exists public.interaction_history
  add column if not exists cache_hit boolean not null default false,
  add column if not exists prompt_tokens integer,
  add column if not exists completion_tokens integer,
  add column if not exists spoiler_floor_verified boolean not null default true,
  add column if not exists user_helpful_vote smallint not null default 0,
  add column if not exists error_code text,
  add column if not exists response_card jsonb not null default '{}'::jsonb,
  add column if not exists is_pinned boolean not null default false;

-- Ensure the 7 newly introduced tables exist if 0001 was already marked applied on an older deployment:
create table if not exists public.entity_relationships (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  source_entity_id uuid not null references public.entities(id) on delete cascade,
  target_entity_id uuid not null references public.entities(id) on delete cascade,
  relationship_type text not null check (char_length(btrim(relationship_type)) >= 2),
  relationship_summary text not null check (char_length(btrim(relationship_summary)) >= 5),
  reveal_time_ms bigint not null default 0 check (reveal_time_ms >= 0),
  valid_from_ms bigint not null default 0 check (valid_from_ms >= 0),
  valid_until_ms bigint check (valid_until_ms is null or valid_until_ms >= valid_from_ms),
  is_secret_reveal boolean not null default false,
  created_at timestamptz not null default now(),
  check (source_entity_id <> target_entity_id)
);

create table if not exists public.episode_quizzes (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  unlock_time_ms bigint not null default 0 check (unlock_time_ms >= 0),
  profile_mode household_profile_mode not null default 'quick_glance',
  difficulty_level text not null default 'medium'
    check (difficulty_level in ('easy', 'medium', 'hard')),
  question_text text not null check (char_length(btrim(question_text)) >= 10),
  options jsonb not null
    check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6),
  correct_option_index smallint not null check (correct_option_index between 0 and 5),
  explanation_text text not null check (char_length(btrim(explanation_text)) >= 5),
  created_at timestamptz not null default now()
);

create table if not exists public.temporal_embeddings (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  source_type text not null
    check (source_type in ('transcript', 'scene_summary', 'entity_lore')),
  source_ref_id uuid,
  start_time_ms bigint not null default 0 check (start_time_ms >= 0),
  end_time_ms bigint not null check (end_time_ms >= start_time_ms),
  reveal_time_ms bigint not null default 0 check (reveal_time_ms >= 0),
  content_text text not null check (char_length(btrim(content_text)) >= 5),
  embedding_model text not null default 'text-embedding-3-small-8d',
  embedding_vector float4[] not null check (cardinality(embedding_vector) >= 4),
  search_vector tsvector generated always as (to_tsvector('english', coalesce(content_text, ''))) stored,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id text not null check (char_length(btrim(device_id)) >= 3),
  profile_id uuid references public.profiles(id) on delete set null,
  episode_id uuid not null references public.episodes(id) on delete cascade,
  last_playback_position_ms bigint not null default 0 check (last_playback_position_ms >= 0),
  turn_count integer not null default 0 check (turn_count >= 0),
  recent_turns jsonb not null default '[]'::jsonb
    check (jsonb_typeof(recent_turns) = 'array'),
  bookmarked_moments jsonb not null default '[]'::jsonb
    check (jsonb_typeof(bookmarked_moments) = 'array'),
  expires_at timestamptz not null default (now() + interval '12 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_id, episode_id)
);

create table if not exists public.ai_provider_metrics (
  bucket_hour timestamptz not null,
  provider_name text not null,
  action_type text not null,
  total_requests bigint not null default 0 check (total_requests >= 0),
  successful_requests bigint not null default 0 check (successful_requests >= 0),
  failed_requests bigint not null default 0 check (failed_requests >= 0),
  cache_hits bigint not null default 0 check (cache_hits >= 0),
  failover_count bigint not null default 0 check (failover_count >= 0),
  total_latency_ms bigint not null default 0 check (total_latency_ms >= 0),
  min_latency_ms integer check (min_latency_ms is null or min_latency_ms >= 0),
  max_latency_ms integer check (max_latency_ms is null or max_latency_ms >= 0),
  total_tokens bigint not null default 0 check (total_tokens >= 0),
  updated_at timestamptz not null default now(),
  primary key (bucket_hour, provider_name, action_type)
);

create table if not exists public.device_rate_limits (
  device_id text not null,
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count >= 0),
  blocked_count integer not null default 0 check (blocked_count >= 0),
  last_request_at timestamptz not null default now(),
  primary key (device_id, window_start)
);

create table if not exists public.spoiler_audit_log (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid references public.episodes(id) on delete set null,
  requested_playback_ms bigint not null,
  blocked_item_timestamp_ms bigint,
  audit_event_type text not null
    check (audit_event_type in (
      'clamped_negative_playback',
      'clamped_overflow_playback',
      'blocked_future_spoiler',
      'malformed_spoiler_metadata',
      'verified_clean_window'
    )),
  source_rpc text not null default 'get_spoiler_safe_context',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$ begin
  alter table public.spoiler_audit_log drop constraint if exists spoiler_audit_log_audit_event_type_check;
  alter table public.spoiler_audit_log
    add constraint spoiler_audit_log_audit_event_type_check
    check (audit_event_type in (
      'clamped_negative_playback',
      'clamped_overflow_playback',
      'blocked_future_spoiler',
      'malformed_spoiler_metadata',
      'verified_clean_window'
    ));
exception
  when undefined_table or duplicate_object then null;
end $$;

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
-- 2. Privilege Hardening & Anti-Spoiler Row-Level Security Policies
-- ----------------------------------------------------------------------------

-- 2.1 Remove any legacy permissive public SELECT policies on spoiler-sensitive tables
drop policy if exists "Allow public read access on scene_contexts" on public.scene_contexts;
drop policy if exists "Allow public read access on transcript_segments" on public.transcript_segments;
drop policy if exists "Allow public read access on entities" on public.entities;
drop policy if exists "Allow public read access on entity_appearances" on public.entity_appearances;
drop policy if exists "Allow public read access on entity_relationships" on public.entity_relationships;
drop policy if exists "Allow public read access on episode_quizzes" on public.episode_quizzes;
drop policy if exists "Allow public read access on temporal_embeddings" on public.temporal_embeddings;

-- 2.2 Revoke direct untrusted writes on catalog, spoiler-sensitive, cache, rate-limit & audit tables,
--     and revoke direct untrusted SELECT on raw spoiler-sensitive tables so clients must use the
--     SECURITY DEFINER anti-spoiler RPCs.
revoke all on table
  public.scene_contexts,
  public.transcript_segments,
  public.entities,
  public.entity_appearances,
  public.entity_relationships,
  public.episode_quizzes,
  public.temporal_embeddings,
  public.ai_response_cache,
  public.ai_provider_metrics,
  public.device_rate_limits,
  public.spoiler_audit_log
from anon, authenticated;

revoke insert, update, delete, truncate on table
  public.programs,
  public.episodes
from anon, authenticated;

grant select on table
  public.programs,
  public.episodes
to anon, authenticated, service_role;

grant select, insert, update on table
  public.profiles,
  public.conversation_sessions
to anon, authenticated, service_role;

grant select, insert on table
  public.interaction_history
to anon, authenticated, service_role;

grant all on all tables in schema public to service_role;

-- 2.3 Public Read-Only Catalog Metadata (Top-Level Non-Spoiler Program/Episode Listing)
drop policy if exists "Allow public read access on active programs" on public.programs;
create policy "Allow public read access on active programs"
  on public.programs for select
  to anon, authenticated, service_role
  using (is_active = true);

drop policy if exists "Allow public read access on published episodes" on public.episodes;
create policy "Allow public read access on published episodes"
  on public.episodes for select
  to anon, authenticated, service_role
  using (is_published = true);

-- 2.4 Spoiler-Sensitive Tables: Trusted Server Role + Server-Verified Playback Gate Only
--     Direct client queries without a server-injected wisp.trusted_playback_ms GUC are denied.
--     All normal client reads go through the SECURITY DEFINER RPCs (get_spoiler_safe_context, etc.).

drop policy if exists "Enforce temporal spoiler gate on scene_contexts" on public.scene_contexts;
create policy "Enforce temporal spoiler gate on scene_contexts"
  on public.scene_contexts for select
  using (
    current_user in ('postgres', 'service_role')
    or (
      nullif(current_setting('wisp.trusted_episode_id', true), '') is not null
      and nullif(current_setting('wisp.trusted_playback_ms', true), '') ~ '^[0-9]+$'
      and episode_id = nullif(current_setting('wisp.trusted_episode_id', true), '')::uuid
      and start_time_ms <= nullif(current_setting('wisp.trusted_playback_ms', true), '')::bigint
    )
  );

drop policy if exists "Enforce temporal spoiler gate on transcript_segments" on public.transcript_segments;
create policy "Enforce temporal spoiler gate on transcript_segments"
  on public.transcript_segments for select
  using (
    current_user in ('postgres', 'service_role')
    or (
      nullif(current_setting('wisp.trusted_episode_id', true), '') is not null
      and nullif(current_setting('wisp.trusted_playback_ms', true), '') ~ '^[0-9]+$'
      and episode_id = nullif(current_setting('wisp.trusted_episode_id', true), '')::uuid
      and end_time_ms <= nullif(current_setting('wisp.trusted_playback_ms', true), '')::bigint
    )
  );

drop policy if exists "Enforce temporal spoiler gate on entities" on public.entities;
create policy "Enforce temporal spoiler gate on entities"
  on public.entities for select
  using (
    current_user in ('postgres', 'service_role')
    or (
      nullif(current_setting('wisp.trusted_playback_ms', true), '') ~ '^[0-9]+$'
      and spoiler_floor_ms <= nullif(current_setting('wisp.trusted_playback_ms', true), '')::bigint
    )
  );

drop policy if exists "Enforce temporal spoiler gate on entity_appearances" on public.entity_appearances;
create policy "Enforce temporal spoiler gate on entity_appearances"
  on public.entity_appearances for select
  using (
    current_user in ('postgres', 'service_role')
    or (
      nullif(current_setting('wisp.trusted_episode_id', true), '') is not null
      and nullif(current_setting('wisp.trusted_playback_ms', true), '') ~ '^[0-9]+$'
      and episode_id = nullif(current_setting('wisp.trusted_episode_id', true), '')::uuid
      and reveal_time_ms <= nullif(current_setting('wisp.trusted_playback_ms', true), '')::bigint
    )
  );

drop policy if exists "Enforce temporal spoiler gate on entity_relationships" on public.entity_relationships;
create policy "Enforce temporal spoiler gate on entity_relationships"
  on public.entity_relationships for select
  using (
    current_user in ('postgres', 'service_role')
    or (
      nullif(current_setting('wisp.trusted_episode_id', true), '') is not null
      and nullif(current_setting('wisp.trusted_playback_ms', true), '') ~ '^[0-9]+$'
      and episode_id = nullif(current_setting('wisp.trusted_episode_id', true), '')::uuid
      and reveal_time_ms <= nullif(current_setting('wisp.trusted_playback_ms', true), '')::bigint
    )
  );

drop policy if exists "Enforce temporal spoiler gate on episode_quizzes" on public.episode_quizzes;
create policy "Enforce temporal spoiler gate on episode_quizzes"
  on public.episode_quizzes for select
  using (
    current_user in ('postgres', 'service_role')
    or (
      nullif(current_setting('wisp.trusted_episode_id', true), '') is not null
      and nullif(current_setting('wisp.trusted_playback_ms', true), '') ~ '^[0-9]+$'
      and episode_id = nullif(current_setting('wisp.trusted_episode_id', true), '')::uuid
      and unlock_time_ms <= nullif(current_setting('wisp.trusted_playback_ms', true), '')::bigint
    )
  );

drop policy if exists "Enforce temporal spoiler gate on temporal_embeddings" on public.temporal_embeddings;
create policy "Enforce temporal spoiler gate on temporal_embeddings"
  on public.temporal_embeddings for select
  using (
    current_user in ('postgres', 'service_role')
    or (
      nullif(current_setting('wisp.trusted_episode_id', true), '') is not null
      and nullif(current_setting('wisp.trusted_playback_ms', true), '') ~ '^[0-9]+$'
      and episode_id = nullif(current_setting('wisp.trusted_episode_id', true), '')::uuid
      and end_time_ms <= nullif(current_setting('wisp.trusted_playback_ms', true), '')::bigint
      and reveal_time_ms <= nullif(current_setting('wisp.trusted_playback_ms', true), '')::bigint
    )
  );

-- 2.5 Household Profiles, Conversation Sessions & Interaction History Policies
drop policy if exists "Allow read access on profiles" on public.profiles;
create policy "Allow read access on profiles"
  on public.profiles for select
  to anon, authenticated, service_role
  using (true);

drop policy if exists "Allow profile creation and mode updates" on public.profiles;
create policy "Allow profile creation and mode updates"
  on public.profiles for insert
  to anon, authenticated, service_role
  with check (char_length(btrim(device_id)) >= 3);

drop policy if exists "Allow profile updates by device" on public.profiles;
create policy "Allow profile updates by device"
  on public.profiles for update
  to anon, authenticated, service_role
  using (true)
  with check (char_length(btrim(device_id)) >= 3);

drop policy if exists "Allow read access on conversation_sessions" on public.conversation_sessions;
create policy "Allow read access on conversation_sessions"
  on public.conversation_sessions for select
  to anon, authenticated, service_role
  using (expires_at > now());

drop policy if exists "Allow upsert on conversation_sessions" on public.conversation_sessions;
create policy "Allow upsert on conversation_sessions"
  on public.conversation_sessions for insert
  to anon, authenticated, service_role
  with check (char_length(btrim(device_id)) >= 3);

drop policy if exists "Allow update on conversation_sessions" on public.conversation_sessions;
create policy "Allow update on conversation_sessions"
  on public.conversation_sessions for update
  to anon, authenticated, service_role
  using (true)
  with check (char_length(btrim(device_id)) >= 3);

drop policy if exists "Allow read access on interaction_history" on public.interaction_history;
create policy "Allow read access on interaction_history"
  on public.interaction_history for select
  to anon, authenticated, service_role
  using (true);

drop policy if exists "Allow inserting interaction_history" on public.interaction_history;
create policy "Allow inserting interaction_history"
  on public.interaction_history for insert
  to anon, authenticated, service_role
  with check (playback_position_ms >= 0);

-- 2.6 Server-Side Cache, Telemetry, Rate Limits & Spoiler Audit Policies
--     Direct table writes are restricted to service_role and SECURITY DEFINER RPCs/triggers.
drop policy if exists "Allow read access on ai_response_cache" on public.ai_response_cache;
drop policy if exists "Service role full access on ai_response_cache" on public.ai_response_cache;
create policy "Service role full access on ai_response_cache"
  on public.ai_response_cache for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Allow read access on ai_provider_metrics" on public.ai_provider_metrics;
drop policy if exists "Service role full access on ai_provider_metrics" on public.ai_provider_metrics;
create policy "Service role full access on ai_provider_metrics"
  on public.ai_provider_metrics for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Service role full access on device_rate_limits" on public.device_rate_limits;
create policy "Service role full access on device_rate_limits"
  on public.device_rate_limits for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "Allow read access on spoiler_audit_log" on public.spoiler_audit_log;
drop policy if exists "Service role full access on spoiler_audit_log" on public.spoiler_audit_log;
create policy "Service role full access on spoiler_audit_log"
  on public.spoiler_audit_log for all
  to service_role
  using (true)
  with check (true);

-- ----------------------------------------------------------------------------
-- 3. Trigger Function: Automatic updated_at Timestamp Maintenance
-- ----------------------------------------------------------------------------
create or replace function public.trg_fn_set_updated_at()
returns trigger
language plpgsql
set search_path = public
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
-- 4A. Trigger Function: Child Row Temporal Boundary Validation
--     Prevents inserting or updating any scene, transcript line, entity
--     appearance, relationship, quiz, or embedding whose timestamp exceeds
--     its parent episode.duration_ms.
-- ----------------------------------------------------------------------------
create or replace function public.trg_fn_validate_episode_temporal_bounds()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_episode_duration_ms bigint;
begin
  select duration_ms
  into v_episode_duration_ms
  from public.episodes
  where id = new.episode_id;

  if v_episode_duration_ms is not null then
    if tg_table_name in ('scene_contexts', 'transcript_segments', 'entity_appearances', 'temporal_embeddings') then
      if new.end_time_ms > v_episode_duration_ms then
        raise exception 'Temporal boundary violation on table %: end_time_ms (%) exceeds episode duration_ms (%)',
          tg_table_name, new.end_time_ms, v_episode_duration_ms;
      end if;
    end if;

    if tg_table_name in ('entity_appearances', 'temporal_embeddings', 'entity_relationships') then
      if new.reveal_time_ms > v_episode_duration_ms then
        raise exception 'Temporal boundary violation on %: reveal_time_ms (%) exceeds episode duration_ms (%)',
          tg_table_name, new.reveal_time_ms, v_episode_duration_ms;
      end if;
    end if;

    if tg_table_name = 'entity_relationships' then
      if new.valid_from_ms > v_episode_duration_ms
         or (new.valid_until_ms is not null and new.valid_until_ms > v_episode_duration_ms)
      then
        raise exception 'Temporal boundary violation on entity_relationships: validity window (% .. %) exceeds episode duration_ms (%)',
          new.valid_from_ms, new.valid_until_ms, v_episode_duration_ms;
      end if;
    end if;

    if tg_table_name = 'episode_quizzes' then
      if new.unlock_time_ms > v_episode_duration_ms then
        raise exception 'Temporal boundary violation on episode_quizzes: unlock_time_ms (%) exceeds episode duration_ms (%)',
          new.unlock_time_ms, v_episode_duration_ms;
      end if;
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

drop trigger if exists trg_entity_relationships_bounds on public.entity_relationships;
create trigger trg_entity_relationships_bounds
  before insert or update on public.entity_relationships
  for each row execute function public.trg_fn_validate_episode_temporal_bounds();

drop trigger if exists trg_episode_quizzes_bounds on public.episode_quizzes;
create trigger trg_episode_quizzes_bounds
  before insert or update on public.episode_quizzes
  for each row execute function public.trg_fn_validate_episode_temporal_bounds();

drop trigger if exists trg_temporal_embeddings_bounds on public.temporal_embeddings;
create trigger trg_temporal_embeddings_bounds
  before insert or update on public.temporal_embeddings
  for each row execute function public.trg_fn_validate_episode_temporal_bounds();

-- ----------------------------------------------------------------------------
-- 4B. Trigger Function: Parent Episode Duration Shrink Protection
--     Prevents reducing episodes.duration_ms below timestamps that already
--     exist in dependent temporal child tables (scene_contexts,
--     transcript_segments, entity_appearances, entity_relationships,
--     episode_quizzes, temporal_embeddings).
-- ----------------------------------------------------------------------------
create or replace function public.trg_fn_prevent_unsafe_episode_duration_shrink()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_scene_ms bigint;
  v_max_transcript_ms bigint;
  v_max_appearance_ms bigint;
  v_max_relationship_ms bigint;
  v_max_quiz_ms bigint;
  v_max_embedding_ms bigint;
begin
  if new.duration_ms < old.duration_ms then
    select max(end_time_ms) into v_max_scene_ms
    from public.scene_contexts where episode_id = new.id;
    if v_max_scene_ms is not null and new.duration_ms < v_max_scene_ms then
      raise exception 'Unsafe episode duration reduction on episode %: new duration_ms (%) is less than existing scene_contexts.end_time_ms (%)',
        new.id, new.duration_ms, v_max_scene_ms;
    end if;

    select max(end_time_ms) into v_max_transcript_ms
    from public.transcript_segments where episode_id = new.id;
    if v_max_transcript_ms is not null and new.duration_ms < v_max_transcript_ms then
      raise exception 'Unsafe episode duration reduction on episode %: new duration_ms (%) is less than existing transcript_segments.end_time_ms (%)',
        new.id, new.duration_ms, v_max_transcript_ms;
    end if;

    select max(greatest(end_time_ms, reveal_time_ms)) into v_max_appearance_ms
    from public.entity_appearances where episode_id = new.id;
    if v_max_appearance_ms is not null and new.duration_ms < v_max_appearance_ms then
      raise exception 'Unsafe episode duration reduction on episode %: new duration_ms (%) is less than existing entity_appearances timestamp (%)',
        new.id, new.duration_ms, v_max_appearance_ms;
    end if;

    select max(greatest(reveal_time_ms, valid_from_ms, coalesce(valid_until_ms, 0))) into v_max_relationship_ms
    from public.entity_relationships where episode_id = new.id;
    if v_max_relationship_ms is not null and new.duration_ms < v_max_relationship_ms then
      raise exception 'Unsafe episode duration reduction on episode %: new duration_ms (%) is less than existing entity_relationships timestamp (%)',
        new.id, new.duration_ms, v_max_relationship_ms;
    end if;

    select max(unlock_time_ms) into v_max_quiz_ms
    from public.episode_quizzes where episode_id = new.id;
    if v_max_quiz_ms is not null and new.duration_ms < v_max_quiz_ms then
      raise exception 'Unsafe episode duration reduction on episode %: new duration_ms (%) is less than existing episode_quizzes.unlock_time_ms (%)',
        new.id, new.duration_ms, v_max_quiz_ms;
    end if;

    select max(greatest(end_time_ms, reveal_time_ms)) into v_max_embedding_ms
    from public.temporal_embeddings where episode_id = new.id;
    if v_max_embedding_ms is not null and new.duration_ms < v_max_embedding_ms then
      raise exception 'Unsafe episode duration reduction on episode %: new duration_ms (%) is less than existing temporal_embeddings timestamp (%)',
        new.id, new.duration_ms, v_max_embedding_ms;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_episodes_prevent_unsafe_duration_shrink on public.episodes;
create trigger trg_episodes_prevent_unsafe_duration_shrink
  before update of duration_ms on public.episodes
  for each row execute function public.trg_fn_prevent_unsafe_episode_duration_shrink();

-- ----------------------------------------------------------------------------
-- 5. Trigger Function: Fault-Tolerant Real-Time Interaction Spoiler Audit Guard
--    Inspects response_card->>'spoilerSafeUpToMs' before inserting into
--    interaction_history:
--      * Safely validates that spoilerSafeUpToMs is a valid integer before
--        casting to bigint so malformed payloads ("unknown", null, floats,
--        objects) never abort the interaction_history insert.
--      * If malformed or > playback_position_ms, clamps spoilerSafeUpToMs to
--        playback_position_ms, marks spoiler_floor_verified = false, and logs
--        an immutable row in public.spoiler_audit_log.
-- ----------------------------------------------------------------------------
create or replace function public.trg_fn_enforce_interaction_spoiler_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw_spoiler_text text;
  v_json_type text;
  v_card_spoiler_ms bigint;
begin
  if new.response_card is not null
     and jsonb_typeof(new.response_card) = 'object'
     and (new.response_card ? 'spoilerSafeUpToMs')
  then
    v_json_type := jsonb_typeof(new.response_card->'spoilerSafeUpToMs');
    v_raw_spoiler_text := btrim(new.response_card->>'spoilerSafeUpToMs');

    -- Validate that the JSON value is a valid 64-bit integer before casting
    if v_raw_spoiler_text is null
       or v_json_type not in ('number', 'string')
       or v_raw_spoiler_text !~ '^-?[0-9]{1,18}$'
    then
      new.spoiler_floor_verified := false;
      new.response_card := jsonb_set(
        new.response_card,
        '{spoilerSafeUpToMs}',
        to_jsonb(new.playback_position_ms),
        true
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
        null,
        'malformed_spoiler_metadata',
        'trg_fn_enforce_interaction_spoiler_gate',
        jsonb_build_object(
          'action_type', new.action_type,
          'ai_provider', new.ai_provider,
          'raw_value', coalesce(v_raw_spoiler_text, 'null'),
          'json_type', coalesce(v_json_type, 'null'),
          'clamped_to_ms', new.playback_position_ms
        )
      );

      return new;
    end if;

    v_card_spoiler_ms := v_raw_spoiler_text::bigint;

    if v_card_spoiler_ms > new.playback_position_ms then
      new.spoiler_floor_verified := false;
      new.response_card := jsonb_set(
        new.response_card,
        '{spoilerSafeUpToMs}',
        to_jsonb(new.playback_position_ms),
        true
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
    elsif v_card_spoiler_ms < 0 then
      new.spoiler_floor_verified := false;
      new.response_card := jsonb_set(
        new.response_card,
        '{spoilerSafeUpToMs}',
        to_jsonb(0::bigint),
        true
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
        'clamped_negative_playback',
        'trg_fn_enforce_interaction_spoiler_gate',
        jsonb_build_object(
          'action_type', new.action_type,
          'ai_provider', new.ai_provider,
          'clamped_to_ms', 0
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
