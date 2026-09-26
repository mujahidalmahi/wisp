# Branch Guide: `server` (Backend API, Database & Edge Gateway Workstream)

## 1. Branch Goal
The **`server`** branch is dedicated to building, testing, and hardening Wisp's **NestJS Application API** (`backend/`), **Supabase PostgreSQL Schema & Temporal Anti-Spoiler RPCs** (`database/`), and **Cloudflare Worker Edge Gateway & R2 Media CDN** (`cloudflare/`).

## 2. Primary Ownership Scope
- **`backend/`** — NestJS controllers, DTO validation, rate limiting, and `HybridContextSource` / `WispAiEngine` wiring.
- **`database/`** — Supabase PostgreSQL migrations (`0001_initial_wisp_schema.sql`, `0002_temporal_context_functions.sql`) and demo seeds (`seed_demo_catalog.sql`).
- **`cloudflare/`** — Cloudflare Worker KV caching (15-second timestamp buckets) and R2 open-movie video streaming (`cloudflare/src/index.ts`).

## 3. Active Tasks & Roadmap for `server`
- [x] Scaffold NestJS `/api/v1/health`, `/api/v1/context/:episodeId`, `/api/v1/wisp/features`, and `/api/v1/wisp/query`.
- [x] Create Supabase tables and deterministic `get_spoiler_safe_context()` PL/pgSQL function.
- [x] Connect `ContextService` and `AiGatewayService` to `@wisp/ai-engine`.
- [ ] Add endpoints for saving/retrieving **Pinned Insights & Interaction History** (`interaction_history` table).
- [ ] Add endpoints for **Household Profile Management** (`profiles` table).
- [ ] Configure live Supabase project & Cloudflare KV/R2 bindings for hackathon judging.

## 4. Development & Verification Commands (`server`)
```bash
npm run dev:backend
npm run dev:edge
npm run build:backend
npm run build:edge
```
