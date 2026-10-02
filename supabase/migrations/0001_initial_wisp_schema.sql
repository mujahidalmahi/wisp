-- ============================================================================
-- Migration: 0001_initial_wisp_schema.sql
-- Purpose:   Production-Grade Relational, Range & Temporal Schema for Wisp
--            (AI-Powered Contextual Viewing for Amazon Fire TV)
-- Engine:    PostgreSQL 15+ / Supabase
--
-- Architectural Highlights:
--   1. 16 Normalized & Temporal-Gated Production Tables.
--   2. In-Place Forward Migration Support (ALTER TABLE ... ADD COLUMN IF NOT
--      EXISTS & constraint upgrades) so existing deployments that ran the
--      early prototype 0001 migration upgrade cleanly without missing columns.
--   3. GiST int8range Exclusion Constraint (excl_scene_contexts_no_overlap)
--      mathematically preventing overlapping scenes within the same episode.
--   4. Covering Indexes (INCLUDE) & Partial Indexes for Index-Only Scans
--      (Heap Fetches: 0) on real-time playback queries.
--   5. Weighted Generated tsvector Full-Text Search + pg_trgm Trigram Indexes.
--   6. Native float4[] Semantic Vector Storage for Hybrid RRF RAG Search.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Required PostgreSQL Extensions & Standard Supabase Roles (Idempotent)
-- ----------------------------------------------------------------------------
-- pgcrypto: Provides gen_random_uuid() and cryptographic hashing functions.
create extension if not exists "pgcrypto";

-- pg_trgm: Provides trigram similarity matching (%) and GIN trigram indexes.
create extension if not exists "pg_trgm";

-- btree_gist: Enables GiST exclusion constraints combining UUID (=) and int8range (&&).
create extension if not exists "btree_gist";

-- vector: Optional pgvector extension (gracefully skipped if host uses native float4[]).
do $$ begin
  create extension if not exists "vector";
exception
  when others then
    raise notice 'pgvector extension not available on this host; using native float4[] vector engine.';
end $$;

-- Ensure standard Supabase API roles exist on standalone/CI PostgreSQL instances
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

-- ----------------------------------------------------------------------------
-- 1. Custom Enumerated Types
-- ----------------------------------------------------------------------------
-- household_profile_mode: Controls AI response tone, depth, and vocabulary on Fire TV.
do $$ begin
  create type household_profile_mode as enum (
    'quick_glance',     -- 1-2 crisp sentences for fast mid-playback glancing
    'deep_lore',        -- Detailed lore, production context, and narrative connections
    'family_friendly'   -- Age-safe, accessible explanations suitable for younger viewers
  );
exception
  when duplicate_object then null;
end $$;

-- spoiler_strictness_level: Controls temporal boundary tolerance per household profile.
do $$ begin
  create type spoiler_strictness_level as enum (
    'strict',           -- Hard mathematical cutoff at exact playback_position_ms
    'moderate',         -- Allows current scene summary even if scene just started
    'relaxed'           -- Allows general non-twist character background
  );
exception
  when duplicate_object then null;
end $$;

-- wisp_action_type_enum: Enumerates supported contextual AI feature pipelines.
do $$ begin
  create type wisp_action_type_enum as enum (
    'contextual_qa',    -- Open-ended viewer question grounded in recent transcript
    'entity_explain',   -- Character, location, concept, or object breakdown
    'scene_explain',    -- Active scene narrative & visual explanation
    'episode_recap',    -- Spoiler-safe "Catch me up to this exact moment" recap
    'post_watch_quiz',  -- Interactive multiple-choice trivia unlocked up to playback head
    'voice_companion'   -- Push-to-talk spoken query & TTS spoken response
  );
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Table: public.profiles
--    Stores Fire TV device household profiles and viewing preferences.
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  device_id text not null check (char_length(btrim(device_id)) >= 3),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  mode household_profile_mode not null default 'quick_glance',
  spoiler_strictness text not null default 'strict'
    check (spoiler_strictness in ('strict', 'moderate', 'relaxed')),
  preferred_language text not null default 'en'
    check (char_length(btrim(preferred_language)) between 2 and 10),
  voice_tts_enabled boolean not null default true,
  auto_pause_on_overlay boolean not null default false,
  parental_pin_hash text,
  total_queries_count bigint not null default 0 check (total_queries_count >= 0),
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (device_id, display_name)
);

-- Forward upgrade path for existing deployments where public.profiles already existed:
alter table public.profiles
  add column if not exists preferred_language text not null default 'en'
    check (char_length(btrim(preferred_language)) between 2 and 10),
  add column if not exists voice_tts_enabled boolean not null default true,
  add column if not exists auto_pause_on_overlay boolean not null default false,
  add column if not exists parental_pin_hash text,
  add column if not exists total_queries_count bigint not null default 0
    check (total_queries_count >= 0),
  add column if not exists last_active_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and contype = 'u'
  ) then
    alter table public.profiles
      add constraint profiles_device_id_display_name_key unique (device_id, display_name);
  end if;
exception
  when duplicate_table or duplicate_object then null;
end $$;

comment on table public.profiles is 'Fire TV household viewing profiles controlling AI explanation depth, TTS narration, and spoiler strictness.';
comment on column public.profiles.device_id is 'Hardware or installation identifier for the Amazon Fire TV device.';
comment on column public.profiles.mode is 'Active viewing mode: quick_glance, deep_lore, or family_friendly.';

-- Covering index for single-lookup profile resolution by Fire TV device_id
drop index if exists public.idx_profiles_device_id;
create index if not exists idx_profiles_device_id
  on public.profiles (device_id)
  include (display_name, mode, spoiler_strictness, voice_tts_enabled);

-- ----------------------------------------------------------------------------
-- 3. Table: public.programs
--    Top-level catalog entries (Series, Movies, Science Documentaries).
-- ----------------------------------------------------------------------------
create table if not exists public.programs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) >= 1),
  genre text not null check (char_length(btrim(genre)) >= 1),
  synopsis text not null check (char_length(btrim(synopsis)) >= 10),
  release_year integer check (release_year is null or (release_year between 1900 and 2100)),
  rating text not null default 'TV-PG'
    check (rating in ('TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA', 'G', 'PG', 'PG-13', 'R', 'NR')),
  content_advisories text[] not null default '{}'::text[],
  original_language text not null default 'en',
  total_seasons integer not null default 1 check (total_seasons >= 1),
  poster_url text,
  backdrop_url text,
  license_info text not null default 'CC-BY / Public Domain',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Forward upgrade path for existing deployments where public.programs already existed:
alter table public.programs
  add column if not exists content_advisories text[] not null default '{}'::text[],
  add column if not exists original_language text not null default 'en',
  add column if not exists total_seasons integer not null default 1 check (total_seasons >= 1),
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

comment on table public.programs is 'Top-level television series, films, and documentaries available in the Wisp catalog.';

create index if not exists idx_programs_genre_active
  on public.programs (genre, is_active)
  where is_active = true;

create index if not exists idx_programs_title_trgm
  on public.programs using gin (title gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 4. Table: public.episodes
--    Playable media assets with duration bounds and cache bucket configuration.
-- ----------------------------------------------------------------------------
create table if not exists public.episodes (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  season_number integer not null default 1 check (season_number >= 1),
  episode_number integer not null default 1 check (episode_number >= 1),
  title text not null check (char_length(btrim(title)) >= 1),
  summary text not null check (char_length(btrim(summary)) >= 10),
  duration_ms bigint not null check (duration_ms > 0),
  intro_end_ms bigint not null default 0 check (intro_end_ms >= 0 and intro_end_ms <= duration_ms),
  credits_start_ms bigint check (credits_start_ms is null or (credits_start_ms >= 0 and credits_start_ms <= duration_ms)),
  default_bucket_sec integer not null default 15 check (default_bucket_sec between 5 and 60),
  video_stream_url text not null check (char_length(btrim(video_stream_url)) >= 8),
  subtitle_vtt_url text,
  thumbnail_sprite_url text,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, season_number, episode_number)
);

-- Forward upgrade path for existing deployments where public.episodes already existed:
alter table public.episodes
  add column if not exists intro_end_ms bigint not null default 0,
  add column if not exists credits_start_ms bigint,
  add column if not exists default_bucket_sec integer not null default 15
    check (default_bucket_sec between 5 and 60),
  add column if not exists subtitle_vtt_url text,
  add column if not exists thumbnail_sprite_url text,
  add column if not exists is_published boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.episodes'::regclass
      and conname = 'episodes_intro_end_ms_bounds_check'
  ) then
    alter table public.episodes
      add constraint episodes_intro_end_ms_bounds_check
      check (intro_end_ms >= 0 and intro_end_ms <= duration_ms);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.episodes'::regclass
      and conname = 'episodes_credits_start_ms_bounds_check'
  ) then
    alter table public.episodes
      add constraint episodes_credits_start_ms_bounds_check
      check (credits_start_ms is null or (credits_start_ms >= 0 and credits_start_ms <= duration_ms));
  end if;
exception
  when duplicate_object then null;
end $$;

comment on table public.episodes is 'Playable video episodes with millisecond duration boundaries and stream URLs.';
comment on column public.episodes.duration_ms is 'Total playback duration in milliseconds; used as upper bound for temporal clamping.';
comment on column public.episodes.credits_start_ms is 'Timestamp in milliseconds when end credits begin (triggers Post-Watch Quiz chip).';

drop index if exists public.idx_episodes_program_lookup;
create index if not exists idx_episodes_program_lookup
  on public.episodes (program_id, season_number, episode_number)
  include (title, duration_ms, is_published);

-- ----------------------------------------------------------------------------
-- 5. Table: public.scene_contexts
--    Pre-computed scene boundaries, spoiler-safe summaries & D-pad Action Chips.
--    Uses a GiST exclusion constraint on int8range to forbid overlapping scenes.
-- ----------------------------------------------------------------------------
create table if not exists public.scene_contexts (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  scene_index integer not null check (scene_index >= 1),
  start_time_ms bigint not null check (start_time_ms >= 0),
  end_time_ms bigint not null check (end_time_ms > start_time_ms),
  time_range int8range generated always as (int8range(start_time_ms, end_time_ms, '[]')) stored,
  scene_title text not null check (char_length(btrim(scene_title)) >= 1),
  location_name text,
  mood_tag text not null default 'narrative',
  narrative_tension_score smallint not null default 5 check (narrative_tension_score between 1 and 10),
  spoiler_safe_summary text not null check (char_length(btrim(spoiler_safe_summary)) >= 5),
  quick_action_chips jsonb not null default '[]'::jsonb
    check (jsonb_typeof(quick_action_chips) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (episode_id, scene_index),
  -- Mathematical guarantee: No two scenes in the same episode may overlap in time
  constraint excl_scene_contexts_no_overlap
    exclude using gist (episode_id with =, time_range with &&)
);

-- Forward upgrade path for existing deployments where public.scene_contexts already existed:
alter table public.scene_contexts
  add column if not exists time_range int8range
    generated always as (int8range(start_time_ms, end_time_ms, '[]')) stored,
  add column if not exists mood_tag text not null default 'narrative',
  add column if not exists narrative_tension_score smallint not null default 5
    check (narrative_tension_score between 1 and 10),
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.scene_contexts'::regclass
      and conname = 'scene_contexts_episode_id_scene_index_key'
  ) then
    alter table public.scene_contexts
      add constraint scene_contexts_episode_id_scene_index_key
      unique (episode_id, scene_index);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.scene_contexts'::regclass
      and conname = 'excl_scene_contexts_no_overlap'
  ) then
    alter table public.scene_contexts
      add constraint excl_scene_contexts_no_overlap
      exclude using gist (episode_id with =, time_range with &&);
  end if;
exception
  when duplicate_table or duplicate_object then null;
end $$;

comment on table public.scene_contexts is 'Non-overlapping episode scene timeline with Stage-1 instant summaries and zero-typing D-pad QuickActionChips.';
comment on column public.scene_contexts.time_range is 'Generated inclusive int8range [start_time_ms, end_time_ms] used for O(log N) GiST containment queries.';

-- Covering Index for Index-Only Scans (Heap Fetches: 0)
drop index if exists public.idx_scene_contexts_temporal;
create index if not exists idx_scene_contexts_temporal
  on public.scene_contexts (episode_id, start_time_ms, end_time_ms)
  include (scene_index, scene_title, location_name, mood_tag, narrative_tension_score, spoiler_safe_summary, quick_action_chips);

-- GiST Range Index for O(log N) playback_ms <@ time_range containment queries
create index if not exists idx_scene_contexts_timerange_gist
  on public.scene_contexts using gist (episode_id, time_range);

create index if not exists idx_scene_contexts_chips_gin
  on public.scene_contexts using gin (quick_action_chips);

-- ----------------------------------------------------------------------------
-- 6. Table: public.transcript_segments
--    Timestamped dialogue & visual cues.
--    HARD ANTI-SPOILER INVARIANT: Only rows with end_time_ms <= playback_ms
--    may ever be passed into an AI prompt.
-- ----------------------------------------------------------------------------
create table if not exists public.transcript_segments (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  start_time_ms bigint not null check (start_time_ms >= 0),
  end_time_ms bigint not null check (end_time_ms >= start_time_ms),
  time_range int8range generated always as (int8range(start_time_ms, end_time_ms, '[]')) stored,
  speaker_name text,
  dialogue_text text not null check (char_length(btrim(dialogue_text)) >= 1),
  visual_cue text,
  confidence_score numeric(4,3) not null default 1.000
    check (confidence_score between 0.000 and 1.000),
  is_key_plot_point boolean not null default false,
  -- Weighted Full-Text Search vector: Speaker (A), Dialogue (B), Visual Cue (C)
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(speaker_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(dialogue_text, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(visual_cue, '')), 'C')
  ) stored,
  created_at timestamptz not null default now()
);

-- Forward upgrade path for existing deployments where public.transcript_segments already existed:
alter table public.transcript_segments
  add column if not exists time_range int8range
    generated always as (int8range(start_time_ms, end_time_ms, '[]')) stored,
  add column if not exists confidence_score numeric(4,3) not null default 1.000
    check (confidence_score between 0.000 and 1.000),
  add column if not exists is_key_plot_point boolean not null default false,
  add column if not exists search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(speaker_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(dialogue_text, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(visual_cue, '')), 'C')
  ) stored;

comment on table public.transcript_segments is 'Timestamped dialogue lines and visual descriptions gated by end_time_ms <= playback_position_ms.';
comment on column public.transcript_segments.end_time_ms is 'Hard anti-spoiler gate: a line is unlocked only after the viewer reaches end_time_ms.';

-- Covering Index for Index-Only Scans on the hot temporal window path
drop index if exists public.idx_transcript_segments_temporal;
create index if not exists idx_transcript_segments_temporal
  on public.transcript_segments (episode_id, end_time_ms, start_time_ms)
  include (speaker_name, dialogue_text, visual_cue, is_key_plot_point);

-- Partial Index for rapid key-plot-point recap extraction
create index if not exists idx_transcript_segments_key_plot_partial
  on public.transcript_segments (episode_id, end_time_ms)
  include (speaker_name, dialogue_text, visual_cue)
  where is_key_plot_point = true;

create index if not exists idx_transcript_segments_fts
  on public.transcript_segments using gin (search_vector);

create index if not exists idx_transcript_segments_dialogue_trgm
  on public.transcript_segments using gin (dialogue_text gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 7. Table: public.entities
--    Canonical registry of Characters, Locations, Concepts, Objects & Factions.
-- ----------------------------------------------------------------------------
create table if not exists public.entities (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) >= 1),
  aliases text[] not null default '{}'::text[],
  entity_type text not null
    check (entity_type in ('character', 'location', 'concept', 'object', 'faction')),
  base_description text not null check (char_length(btrim(base_description)) >= 5),
  spoiler_floor_ms bigint not null default 0 check (spoiler_floor_ms >= 0),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, slug)
);

-- Forward upgrade path for existing deployments where public.entities already existed:
alter table public.entities
  add column if not exists aliases text[] not null default '{}'::text[],
  add column if not exists spoiler_floor_ms bigint not null default 0
    check (spoiler_floor_ms >= 0),
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.entities drop constraint if exists entities_entity_type_check;
  alter table public.entities
    add constraint entities_entity_type_check
    check (entity_type in ('character', 'location', 'concept', 'object', 'faction'));
exception
  when duplicate_object then null;
end $$;

comment on table public.entities is 'Canonical entities (characters, locations, scientific concepts, objects, factions) per program.';
comment on column public.entities.spoiler_floor_ms is 'Minimum episode timestamp before this entity''s existence may be revealed.';

drop index if exists public.idx_entities_program_type;
create index if not exists idx_entities_program_type
  on public.entities (program_id, entity_type)
  include (slug, name, base_description, spoiler_floor_ms);

create index if not exists idx_entities_name_trgm
  on public.entities using gin (name gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- 8. Table: public.entity_appearances
--    Progressive temporal lore reveals per episode.
--    HARD ANTI-SPOILER INVARIANT: Only rows with reveal_time_ms <= playback_ms
--    are unlocked, preventing premature character identity or plot-twist leaks.
-- ----------------------------------------------------------------------------
create table if not exists public.entity_appearances (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  entity_id uuid not null references public.entities(id) on delete cascade,
  start_time_ms bigint not null check (start_time_ms >= 0),
  end_time_ms bigint not null check (end_time_ms >= start_time_ms),
  reveal_time_ms bigint not null default 0 check (reveal_time_ms >= 0),
  progressive_fact text not null check (char_length(btrim(progressive_fact)) >= 5),
  is_plot_twist boolean not null default false,
  importance_rank smallint not null default 1 check (importance_rank between 1 and 10),
  created_at timestamptz not null default now()
);

-- Forward upgrade path for existing deployments where public.entity_appearances already existed:
alter table public.entity_appearances
  add column if not exists is_plot_twist boolean not null default false,
  add column if not exists importance_rank smallint not null default 1
    check (importance_rank between 1 and 10);

comment on table public.entity_appearances is 'Time-gated progressive lore facts per entity; prevents plot twist leaks prior to reveal_time_ms.';
comment on column public.entity_appearances.reveal_time_ms is 'Exact millisecond timestamp at which this progressive fact becomes spoiler-safe to reveal.';

-- Covering Index for Index-Only Scans on entity lore lookup
drop index if exists public.idx_entity_appearances_temporal;
create index if not exists idx_entity_appearances_temporal
  on public.entity_appearances (episode_id, reveal_time_ms, start_time_ms, end_time_ms)
  include (entity_id, progressive_fact, is_plot_twist, importance_rank);

create index if not exists idx_entity_appearances_entity_lookup
  on public.entity_appearances (entity_id, episode_id, reveal_time_ms);

create index if not exists idx_entity_appearances_twists_partial
  on public.entity_appearances (episode_id, reveal_time_ms)
  where is_plot_twist = true;

-- ----------------------------------------------------------------------------
-- 9. Table: public.entity_relationships
--    Directed temporal graph capturing evolving relationships between entities
--    (e.g., ally -> suspect -> betrayer) gated by reveal_time_ms.
-- ----------------------------------------------------------------------------
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

comment on table public.entity_relationships is 'Directed temporal relationship graph between entities gated by reveal_time_ms and validity window.';

create index if not exists idx_entity_relationships_temporal
  on public.entity_relationships (episode_id, reveal_time_ms, source_entity_id, target_entity_id)
  include (relationship_type, relationship_summary, valid_from_ms, valid_until_ms);

-- ----------------------------------------------------------------------------
-- 10. Table: public.episode_quizzes
--     Curated & verified spoiler-safe multiple-choice trivia bank.
-- ----------------------------------------------------------------------------
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

comment on table public.episode_quizzes is 'Spoiler-safe interactive trivia questions unlocked only when playback_position_ms >= unlock_time_ms.';

create index if not exists idx_episode_quizzes_temporal
  on public.episode_quizzes (episode_id, unlock_time_ms, profile_mode)
  include (difficulty_level, question_text, options, correct_option_index, explanation_text);

-- ----------------------------------------------------------------------------
-- 11. Table: public.temporal_embeddings
--     Semantic vector representations for Hybrid RRF (Lexical + Vector) Search.
-- ----------------------------------------------------------------------------
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

comment on table public.temporal_embeddings is 'Time-gated semantic vector embeddings supporting Hybrid Reciprocal Rank Fusion (RRF) RAG retrieval.';

create index if not exists idx_temporal_embeddings_gate
  on public.temporal_embeddings (episode_id, end_time_ms, reveal_time_ms)
  include (source_type, content_text, embedding_vector);

create index if not exists idx_temporal_embeddings_fts
  on public.temporal_embeddings using gin (search_vector);

-- ----------------------------------------------------------------------------
-- 12. Table: public.conversation_sessions
--     Multi-turn viewing session memory & bookmarked timestamps per Fire TV device.
-- ----------------------------------------------------------------------------
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

comment on table public.conversation_sessions is 'Short-lived multi-turn conversation state and viewer bookmarks per Fire TV device and episode.';

create index if not exists idx_conversation_sessions_device_episode
  on public.conversation_sessions (device_id, episode_id);

-- ----------------------------------------------------------------------------
-- 13. Table: public.ai_response_cache
--     15-second temporal bucket cache for sub-10ms repeat query responses.
-- ----------------------------------------------------------------------------
create table if not exists public.ai_response_cache (
  cache_key text primary key check (char_length(btrim(cache_key)) >= 5),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  action_type text not null,
  profile_mode household_profile_mode not null,
  time_bucket_sec integer not null check (time_bucket_sec >= 0),
  provider_used text not null,
  response_payload jsonb not null check (jsonb_typeof(response_payload) = 'object'),
  hit_count bigint not null default 0 check (hit_count >= 0),
  origin_latency_ms integer check (origin_latency_ms is null or origin_latency_ms >= 0),
  token_count integer check (token_count is null or token_count >= 0),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  last_accessed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Forward upgrade path for existing deployments where public.ai_response_cache already existed:
alter table public.ai_response_cache
  add column if not exists hit_count bigint not null default 0 check (hit_count >= 0),
  add column if not exists origin_latency_ms integer
    check (origin_latency_ms is null or origin_latency_ms >= 0),
  add column if not exists token_count integer
    check (token_count is null or token_count >= 0),
  add column if not exists expires_at timestamptz not null default (now() + interval '24 hours'),
  add column if not exists last_accessed_at timestamptz not null default now();

comment on table public.ai_response_cache is 'Server-side 15-second bucket cache reducing AI token spend and delivering sub-10ms cached cards.';

drop index if exists public.idx_ai_response_cache_lookup;
create index if not exists idx_ai_response_cache_lookup
  on public.ai_response_cache (episode_id, action_type, profile_mode, time_bucket_sec)
  include (response_payload, provider_used, expires_at);

create index if not exists idx_ai_response_cache_expiry
  on public.ai_response_cache (expires_at);

-- ----------------------------------------------------------------------------
-- 14. Table: public.interaction_history
--     Complete session audit trail of viewer queries, latency & helpfulness votes.
-- ----------------------------------------------------------------------------
create table if not exists public.interaction_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  episode_id uuid not null references public.episodes(id) on delete cascade,
  playback_position_ms bigint not null check (playback_position_ms >= 0),
  action_type text not null,
  user_prompt text not null check (char_length(btrim(user_prompt)) >= 1),
  ai_provider text not null,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  cache_hit boolean not null default false,
  prompt_tokens integer check (prompt_tokens is null or prompt_tokens >= 0),
  completion_tokens integer check (completion_tokens is null or completion_tokens >= 0),
  spoiler_floor_verified boolean not null default true,
  user_helpful_vote smallint not null default 0 check (user_helpful_vote in (-1, 0, 1)),
  error_code text,
  response_card jsonb not null default '{}'::jsonb check (jsonb_typeof(response_card) = 'object'),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now()
);

-- Forward upgrade path for existing deployments where public.interaction_history already existed:
alter table public.interaction_history
  add column if not exists cache_hit boolean not null default false,
  add column if not exists prompt_tokens integer
    check (prompt_tokens is null or prompt_tokens >= 0),
  add column if not exists completion_tokens integer
    check (completion_tokens is null or completion_tokens >= 0),
  add column if not exists spoiler_floor_verified boolean not null default true,
  add column if not exists user_helpful_vote smallint not null default 0
    check (user_helpful_vote in (-1, 0, 1)),
  add column if not exists error_code text,
  add column if not exists response_card jsonb not null default '{}'::jsonb
    check (jsonb_typeof(response_card) = 'object'),
  add column if not exists is_pinned boolean not null default false;

comment on table public.interaction_history is 'Immutable log of viewer AI interactions, token consumption, latency, and spoiler-gate verification.';

create index if not exists idx_interaction_history_episode
  on public.interaction_history (episode_id, created_at desc);

create index if not exists idx_interaction_history_profile
  on public.interaction_history (profile_id, created_at desc);

create index if not exists idx_interaction_history_provider_metrics
  on public.interaction_history (ai_provider, action_type, latency_ms)
  where latency_ms is not null;

-- ----------------------------------------------------------------------------
-- 15. Table: public.ai_provider_metrics
--     Hourly time-bucketed telemetry per AI provider and action type.
-- ----------------------------------------------------------------------------
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

comment on table public.ai_provider_metrics is 'Hourly aggregated AI provider telemetry tracking throughput, failovers, cache hits, and latency.';

-- ----------------------------------------------------------------------------
-- 16. Tables: public.device_rate_limits & public.spoiler_audit_log
--     Edge-case rate limiting and immutable spoiler boundary security auditing.
-- ----------------------------------------------------------------------------
create table if not exists public.device_rate_limits (
  device_id text not null,
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count >= 0),
  blocked_count integer not null default 0 check (blocked_count >= 0),
  last_request_at timestamptz not null default now(),
  primary key (device_id, window_start)
);

comment on table public.device_rate_limits is 'Sliding time-window request counters protecting AI provider quotas from remote button-mashing.';

create index if not exists idx_device_rate_limits_window
  on public.device_rate_limits (window_start);

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
  when duplicate_object then null;
end $$;

comment on table public.spoiler_audit_log is 'Security audit trail recording clamped timestamps, malformed metadata, or intercepted spoiler boundary anomalies.';

create index if not exists idx_spoiler_audit_log_created
  on public.spoiler_audit_log (created_at desc, audit_event_type);
