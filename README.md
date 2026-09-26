# Wisp — Main Monorepo (`main` Branch)

> **"A little more, when you need it."**
> AI-Powered Contextual Viewing for Amazon Fire TV — *Amazon Developer Hackathon 2026 (Fire TV Track)*

---

## Branch Goal (`main`)

The **`main`** branch is the **complete integrated monorepo** uniting all Wisp subsystems: the 10-foot Fire TV React Native client (`frontend/`), the standalone modular AI integration engine (`ai-engine/`), the NestJS backend API (`backend/`), the Supabase PostgreSQL schema & anti-spoiler RPCs (`database/`), the Cloudflare Worker edge gateway (`cloudflare/`), and all documentation & agent playbooks (`docs/`, `agents/`).

### Repository Branch Architecture

To enable parallel, production-grade development across domains, this repository is organized into 5 dedicated branches:

| Branch | Goal & Scope | Key Directories |
| :--- | :--- | :--- |
| **`main`** *(Current)* | Full end-to-end integration of all layers and documentation. | `frontend/`, `ai-engine/`, `backend/`, `database/`, `cloudflare/`, `docs/`, `agents/` |
| **`ai-integration`** | Standalone development & testing of AI features, prompts, model adapters, and temporal anti-spoiler filtering with **zero backend/DB dependency**. | `ai-engine/`, `docs/`, `agents/` |
| **`server`** | Backend API, Supabase PostgreSQL schema/migrations/seeds, Cloudflare Edge Worker, and `@wisp/ai-engine` integration. | `backend/`, `database/`, `cloudflare/`, `ai-engine/`, `docs/`, `agents/` |
| **`client`** | 10-foot Amazon Fire TV React Native UI, D-pad remote focus navigation, video player HUD, and Wisp overlay drawer. | `frontend/`, `ai-engine/`, `docs/`, `agents/` |
| **`docs`** | Project proposal, system architecture, API specs, Fire TV UX guide, Hackathon Friction Log (10% bonus), product feedback, and AI agent playbooks. | `docs/`, `agents/` |

---

## Core Architectural Highlights

1. **Modular AI Integration Segment ([`ai-engine/`](./ai-engine/README.md) — `@wisp/ai-engine`)**
   Framework-agnostic AI feature pipelines (`ContextualQaFeature`, `EntityExplainerFeature`, `SceneExplainerFeature`, `EpisodeRecapFeature`, `InteractiveQuizFeature`), multi-provider routing (**Groq** → **Gemini Flash** → **OpenRouter** → **Ollama**), and pure-TypeScript anti-spoiler temporal filtering that can run completely standalone or inside NestJS.
2. **Zero-Typing Dynamic Action Chips (10-Foot First UX)**
   Invoking Wisp at any timestamp immediately renders a `<100ms` local scene header with 3–4 context-aware, one-click D-pad prompts (*"Who is in this scene?"*, *"Catch me up to 08:45"*, *"Explain what just happened"*), plus follow-up chips on every AI card.
3. **Deterministic Anti-Spoiler Temporal Windowing**
   Spoiler safety is enforced both in PostgreSQL (`database/migrations/0002_temporal_context_functions.sql`) and in `@wisp/ai-engine` (`ai-engine/src/context/temporal-filter.ts`): only transcript segments, scene nodes, and character facts where `end_time_ms <= current_playback_ms` and `reveal_time_ms <= current_playback_ms` are unlocked.
4. **Household Viewing Modes**
   One-click profile adaptation on the TV remote (`Quick Glance`, `Deep Lore`, `Family Mode`) dynamically adjusts explanation depth and vocabulary.

---

## Complete Monorepo Structure (`main`)

```text
wisp/
├── ai-engine/              # Standalone modular AI integration & feature segment (@wisp/ai-engine)
├── frontend/               # React Native + TypeScript Fire TV client (10-foot UI, D-pad focus, player & overlay)
├── backend/                # NestJS + TypeScript API wrapping @wisp/ai-engine & Supabase
├── database/               # Supabase PostgreSQL migrations, anti-spoiler RPC functions & 3-genre demo seeds
├── cloudflare/             # Cloudflare Worker edge gateway (KV cache, rate limiting & R2 video streaming)
├── docs/                   # Refined proposal, architecture, AI engine guide, Fire TV UX, friction log & feedback
├── agents/                 # AI agent playbooks, system prompts & coding invariants
└── .github/workflows/      # Basic CI validation pipeline (ci.yml)
```

---

## Quick Start

### 1. Test AI Features Standalone (Zero Backend / Zero Database Required)
```bash
# Run the interactive @wisp/ai-engine CLI playground
npm run ai:playground

# Run standalone anti-spoiler & custom feature unit tests
node --test ai-engine/src/engine.test.ts
```

### 2. Full-Stack Local Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `backend/.env` and `frontend/.env`, and populate your Supabase URL/key and at least one AI provider key (`GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, or `OLLAMA_BASE_URL`).
3. Apply SQL migrations in `database/migrations/` and seed `database/seeds/seed_demo_catalog.sql`.
4. Run the stack:
   ```bash
   # Terminal 1: Start NestJS API & AI Gateway
   npm run dev:backend

   # Terminal 2: Start React Native Metro Bundler for Fire TV
   npm run dev:frontend

   # Terminal 3: Build & launch on Fire TV / Emulator
   npm run android:firetv
   ```

---

## Documentation Index

- [**Refined Project Proposal**](./docs/PROPOSAL.md) — Executive summary, hackathon fit, refined scope & implementation plan
- [**Modular AI Engine Guide (`@wisp/ai-engine`)**](./docs/AI_ENGINE_GUIDE.md) — Building & testing AI features and providers without backend/DB
- [**System Architecture**](./docs/ARCHITECTURE.md) — End-to-end request flow, branch mapping, temporal anti-spoiler SQL, and AI routing
- [**API Specification**](./docs/API_SPEC.md) — REST contracts and standalone `@wisp/ai-engine` programmatic API
- [**Fire TV 10-Foot UX Guide**](./docs/FIRE_TV_UX_GUIDE.md) — Remote keycodes, focus management, overscan, and typography
- [**Developer Friction Log**](./docs/FRICTION_LOG.md) — Real-time engineering friction log (10% Hackathon Bonus criterion)
- [**Product & SDK Feedback**](./docs/PRODUCT_FEEDBACK.md) — Evaluation of Fire TV tooling, `@wisp/ai-engine`, NestJS, Supabase, and Cloudflare
- [**Hackathon Submission Checklist**](./docs/HACKATHON_READINESS.md) — Validation gates and sub-3-minute demo script
