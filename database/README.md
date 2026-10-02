# Wisp Database Layer (Supabase PostgreSQL)

Wisp's database layer is **Supabase PostgreSQL**, holding deterministic **Temporal Anti-Spoiler Windowing** RPC functions and curated public-domain demo catalog data.

## Directory Structure

The PostgreSQL migrations, demo seeds, and Supabase CLI configuration live in the repository-root `supabase/` directory so that `supabase db push` resolves them at the CLI's default location. This directory retains the destructive integration test suite.

## Directory Structure

```text
supabase/
├── config.toml                              # Supabase CLI configuration (local dev + linked project)
├── migrations/
│   ├── 0001_initial_wisp_schema.sql         # 16 Core relational & temporal tables, covering indexes, GiST range exclusion
│   ├── 0002_temporal_context_functions.sql  # Spoiler-safe temporal query RPCs, cache touch/upsert, rate limiting
│   ├── 0003_security_rls_and_triggers.sql   # Zero-trust RLS policies, claim resolvers, duration shrink & spoiler triggers
│   ├── 0004_analytics_views_and_observability.sql # Observability views, exact latency percentiles, health/purge RPCs
│   └── 0005_hybrid_rag_and_cross_episode_context.sql # Cosine similarity, independent RRF search, stage-1 bootstrap
└── seed.sql                                 # 3-genre curated demo catalog, scene graph, quizzes, embeddings

database/
└── tests/
    └── verify_database_integrity.sql        # Reproducible 8-part integration & invariant test suite
```

## Deploying to a Hosted Supabase Project

```bash
# 1. Authenticate and link the CLI to the target project
supabase login
supabase link --project-ref <project-ref>

# 2. Apply 0001 -> 0005 in lexical order
supabase db push

# 3. Load the demo catalog into the hosted database
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.sql
```

Migrations are applied in lexical filename order, so the `0001_` .. `0005_` numeric prefixes are the ordering mechanism and must not be renamed. If `pgvector` is unavailable on the target host, `0001` degrades gracefully to native `float4[]` vector storage and `cosine_similarity_float4` (`0005`) provides the similarity computation.

## Running the Verification Test Suite

To verify fresh installation, schema upgrade from legacy deployments, zero-trust RLS, claim-bound bootstrap profile selection, strict cache card filtering, independent RRF ranking, spoiler audit triggers, and duration shrink guards:

> **Warning:** this suite is destructive. It executes `drop schema if exists public cascade` and must only be run against a disposable local database, never a linked or hosted project.

```bash
supabase start
psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -v ON_ERROR_STOP=1 -f database/tests/verify_database_integrity.sql
```

## Core Design Principle: Deterministic Spoiler Safety

Rather than relying on prompt engineering alone (`"Please don't spoil future scenes"`), Wisp enforces spoiler safety at the database query boundary.

When a Fire TV viewer invokes Wisp at `playback_position_ms`, the NestJS backend invokes `get_spoiler_safe_context(p_episode_id, p_playback_ms, p_lookback_ms)` which strictly filters:
- `transcript_segments` where `end_time_ms <= p_playback_ms`
- `scene_contexts` where `start_time_ms <= p_playback_ms`
- `entity_appearances` where `reveal_time_ms <= p_playback_ms` (preventing premature character Twist/Identity reveals)
