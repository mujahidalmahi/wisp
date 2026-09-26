# Wisp

> **"A little more, when you need it."**
> AI-Powered Contextual Viewing for Amazon Fire TV — *Amazon Developer Hackathon 2026 (Fire TV Track)*

---

## Overview

**Wisp** is a Fire TV application centered on **AI-powered contextual understanding during television viewing**. It helps viewers understand characters, scenes, terminology, and spoiler-safe recaps of what they are actively watching—without leaving the viewing experience or picking up a second screen.

Rather than bolting a generic desktop chatbot onto a TV screen, Wisp treats **playback position, current program context, household viewing mode, and 5-way D-pad remote ergonomics** as one unified 10-foot experience.

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

## Monorepo Structure

```text
wisp/
├── ai-engine/              # Standalone modular AI integration & feature segment (@wisp/ai-engine)
├── frontend/               # React Native + TypeScript Fire TV client (10-foot UI, D-pad focus, player & overlay)
├── backend/                # NestJS + TypeScript API wrapping @wisp/ai-engine & Supabase
├── database/               # Supabase PostgreSQL migrations, anti-spoiler RPC functions & 3-genre demo seeds
├── cloudflare/             # Cloudflare Worker edge gateway (KV cache, rate limiting & R2 video streaming)
├── testing/                # Comprehensive test suites (ai-integration, backend, frontend, database, cloudflare, full-application)
├── docs/                   # Proposals, architecture, branch guides (docs/branches/), friction log & feedback
├── agents/                 # AI agent playbooks, system prompts & coding invariants
└── .github/workflows/      # Basic CI validation pipeline (ci.yml)
```

---

## Repository Branches & Workstream Guides

All branches start from the exact same baseline commit and directory tree so every developer can test end-to-end and merge into `main` cleanly:

| Branch | Branch Guide (Goals & Tasks) | Focus Area | Primary Directories Owned |
| :--- | :--- | :--- | :--- |
| **`main`** | [**`docs/branches/MAIN.md`**](./docs/branches/MAIN.md) | Production integration, end-to-end validation gates & release readiness. | All workspaces (`frontend/`, `backend/`, `database/`, `cloudflare/`, `ai-engine/`, `docs/`) |
| **`ai-integration`** | [**`docs/branches/AI_INTEGRATION.md`**](./docs/branches/AI_INTEGRATION.md) | Modular AI features, prompts, LLM provider adapters & standalone temporal filtering. | `ai-engine/`, `agents/prompts/`, `docs/AI_ENGINE_GUIDE.md` |
| **`server`** | [**`docs/branches/SERVER.md`**](./docs/branches/SERVER.md) | NestJS REST API, Supabase PostgreSQL schema/RPCs/seeds & Cloudflare Worker edge gateway. | `backend/`, `database/`, `cloudflare/` |
| **`client`** | [**`docs/branches/CLIENT.md`**](./docs/branches/CLIENT.md) | 10-foot Amazon Fire TV React Native UI, D-pad spatial focus & video player overlay. | `frontend/`, `docs/FIRE_TV_UX_GUIDE.md` |
| **`docs`** | [**`docs/branches/DOCS.md`**](./docs/branches/DOCS.md) | Project proposal, architecture specs, Hackathon Friction Log (10% bonus) & product feedback. | `docs/`, `agents/` |

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
```bash
# 1. Install all workspace dependencies
npm install

# 2. Start NestJS API & AI Gateway (http://localhost:3000/api/v1)
npm run dev:backend

# 3. Start React Native Metro Bundler for Fire TV
npm run dev:frontend

# 4. Launch on Fire TV Device or Emulator
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
