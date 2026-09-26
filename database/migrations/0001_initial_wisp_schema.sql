-- ============================================================================
-- Migration: 0001_initial_wisp_schema.sql
-- Purpose: Core production schema for Wisp (Amazon Fire TV Contextual AI)
-- ============================================================================

create extension if not exists "pgcrypto";

-- 1. Household Viewing Mode Enum
do $$ begin
  create type household_profile_mode as enum (
    'quick_glance',
    'deep_lore',
    'family_friendly'
  );
exception
  when duplicate_object then null;
end $$;

-- 2. Household Profiles
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  display_name text not null,
  mode household_profile_mode not null default 'quick_glance',
  spoiler_strictness text not null default 'strict',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Programs (Series, Movies, Documentaries)
create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  genre text not null,
  synopsis text not null,
  release_year integer,
  rating text default 'TV-PG',
  poster_url text,
  backdrop_url text,
  license_info text not null default 'CC-BY / Public Domain',
  created_at timestamptz not null default now()
);

-- 4. Episodes / Playable Media Assets
create table if not exists public.episodes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  season_number integer not null default 1,
  episode_number integer not null default 1,
  title text not null,
  summary text not null,
  duration_ms bigint not null,
  video_stream_url text not null,
  created_at timestamptz not null default now(),
  unique (program_id, season_number, episode_number)
);

-- 5. Scene Contexts (Pre-computed scene boundaries & zero-typing action chips)
create table if not exists public.scene_contexts (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  scene_index integer not null,
  start_time_ms bigint not null,
  end_time_ms bigint not null,
  scene_title text not null,
  location_name text,
  spoiler_safe_summary text not null,
  quick_action_chips jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_scene_contexts_temporal
  on public.scene_contexts (episode_id, start_time_ms, end_time_ms);

-- 6. Timestamped Transcript Segments
create table if not exists public.transcript_segments (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  start_time_ms bigint not null,
  end_time_ms bigint not null,
  speaker_name text,
  dialogue_text text not null,
  visual_cue text,
  created_at timestamptz not null default now()
);

create index if not exists idx_transcript_segments_temporal
  on public.transcript_segments (episode_id, end_time_ms);

-- 7. Entities (Characters, Locations, Scientific Terms, Key Objects)
create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  slug text not null,
  name text not null,
  entity_type text not null check (entity_type in ('character', 'location', 'concept', 'object')),
  base_description text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  unique (program_id, slug)
);

-- 8. Entity Appearances & Temporal Lore Reveals (Prevents plot twist spoilers!)
create table if not exists public.entity_appearances (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  entity_id uuid not null references public.entities(id) on delete cascade,
  start_time_ms bigint not null,
  end_time_ms bigint not null,
  reveal_time_ms bigint not null default 0,
  progressive_fact text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_entity_appearances_temporal
  on public.entity_appearances (episode_id, reveal_time_ms, start_time_ms, end_time_ms);

-- 9. AI Response Cache (Cost & latency control across identical timestamp buckets)
create table if not exists public.ai_response_cache (
  cache_key text primary key,
  episode_id uuid not null references public.episodes(id) on delete cascade,
  action_type text not null,
  profile_mode household_profile_mode not null,
  time_bucket_sec integer not null,
  provider_used text not null,
  response_payload jsonb not null,
  created_at timestamptz not null default now()
);

-- 10. Session Context Trail / Interaction History
create table if not exists public.interaction_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  episode_id uuid not null references public.episodes(id) on delete cascade,
  playback_position_ms bigint not null,
  action_type text not null,
  user_prompt text not null,
  ai_provider text not null,
  latency_ms integer,
  response_card jsonb not null,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_interaction_history_episode
  on public.interaction_history (episode_id, created_at desc);
