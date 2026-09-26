# Wisp Database Layer (Supabase PostgreSQL)

This directory contains the PostgreSQL schema migrations, deterministic **Temporal Anti-Spoiler Windowing** RPC functions, and curated public-domain demo seeds for **Wisp**.

## Directory Structure

```text
database/
├── supabase/
│   └── config.toml                          # Local Supabase CLI configuration
├── migrations/
│   ├── 0001_initial_wisp_schema.sql         # Core tables, indexes, and RLS policies
│   └── 0002_temporal_context_functions.sql  # Spoiler-safe temporal query functions
└── seeds/
    └── seed_demo_catalog.sql                # 3-genre curated demo catalog & scene graph
```

## Core Design Principle: Deterministic Spoiler Safety

Rather than relying on prompt engineering alone (`"Please don't spoil future scenes"`), Wisp enforces spoiler safety at the database query boundary.

When a Fire TV viewer invokes Wisp at `playback_position_ms`, the NestJS backend invokes `get_spoiler_safe_context(p_episode_id, p_playback_ms, p_lookback_ms)` which strictly filters:
- `transcript_segments` where `end_time_ms <= p_playback_ms`
- `scene_contexts` where `start_time_ms <= p_playback_ms`
- `entity_appearances` where `reveal_time_ms <= p_playback_ms` (preventing premature character Twist/Identity reveals)
