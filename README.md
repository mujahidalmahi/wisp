# Wisp

> **"A little more, when you need it."**
> AI-Powered Contextual Viewing for Amazon Fire TV — *Amazon Developer Hackathon 2026 (Fire TV Track)*

---

## Overview

**Wisp** is a Fire TV application centered on **AI-powered contextual understanding during television viewing**. It helps viewers understand characters, scenes, terminology, and spoiler-safe recaps of what they are actively watching—without leaving the viewing experience or picking up a second screen.

Rather than bolting a generic desktop chatbot onto a TV screen, Wisp treats **playback position, current program context, household viewing mode, and 5-way D-pad remote ergonomics** as one unified 10-foot experience.

---

## Core Architectural Highlights

1. **Zero-Typing Dynamic Action Chips (10-Foot First UX)**
   Invoking Wisp at any timestamp immediately renders a `<100ms` local scene header with 3–4 context-aware, one-click D-pad prompts (*"Who is in this scene?"*, *"Catch me up to 08:45"*, *"Explain what just happened"*), plus follow-up chips on every AI card.
2. **Deterministic Anti-Spoiler Temporal Windowing**
   Spoiler safety is enforced mathematically in PostgreSQL (`database/migrations/0002_temporal_context_functions.sql`): the backend only retrieves transcript segments, scene nodes, and character facts where `end_time_ms <= current_playback_ms`.
3. **Household Viewing Modes**
   One-click profile adaptation on the TV remote (`Quick Glance`, `Deep Lore`, `Family / Kid-Friendly`) dynamically adjusts explanation depth and vocabulary.
4. **Multi-Provider AI Gateway & Edge Caching**
   Server-side NestJS AI abstraction with latency-prioritized routing (**Groq** → **Gemini Flash** → **OpenRouter** → **Ollama** local fallback), fronted by a **Cloudflare Worker** edge gateway for response caching, request deduplication, and R2 open-movie media streaming.

---

## Monorepo Structure

```text
wisp/
├── frontend/               # React Native + TypeScript Fire TV client (10-foot UI, D-pad focus, player & overlay)
├── backend/                # NestJS + TypeScript API, temporal context service & multi-provider AI gateway
├── database/               # Supabase PostgreSQL migrations, anti-spoiler RPC functions & 3-genre demo seeds
├── cloudflare/             # Cloudflare Worker edge gateway (KV cache, rate limiting & R2 video streaming)
├── docs/                   # Refined proposal, architecture specs, Fire TV UX guide, friction log & feedback
├── agents/                 # AI agent playbooks, system prompts & coding invariants
└── .github/workflows/      # CI/CD pipelines for lint/typecheck, backend deploy, Cloudflare edge & Fire TV APK
```

---

## Quick Start

### 1. Prerequisites
- **Node.js** `>= 20.x` and **npm** `>= 10.x`
- **Android Studio / ADB** (for Fire TV device or Android TV / Fire OS emulator)
- **Supabase CLI** (optional for local DB) or a free-tier Supabase project
- At least one free-tier AI key (**Groq**, **Gemini**, or **OpenRouter**) or local **Ollama**

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment
Copy `.env.example` into `backend/.env` and `frontend/.env` and populate your Supabase URL/key and at least one AI provider key.

### 4. Apply Database Schema & Demo Seeds
Run the SQL files in `database/migrations/` followed by `database/seeds/seed_demo_catalog.sql` in your Supabase SQL Editor (or via `supabase db reset`).

### 5. Run Backend & Fire TV Client
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
- [**System Architecture**](./docs/ARCHITECTURE.md) — End-to-end request flow, temporal anti-spoiler SQL, and AI routing
- [**API Specification**](./docs/API_SPEC.md) — REST contracts between Fire TV client, Cloudflare Edge, and NestJS
- [**Fire TV 10-Foot UX Guide**](./docs/FIRE_TV_UX_GUIDE.md) — Remote keycodes, focus management, overscan, and typography
- [**Developer Friction Log**](./docs/FRICTION_LOG.md) — Real-time engineering friction log (10% Hackathon Bonus criterion)
- [**Product & SDK Feedback**](./docs/PRODUCT_FEEDBACK.md) — Evaluation of Fire TV tooling, NestJS, Supabase, and AI APIs
- [**Hackathon Submission Checklist**](./docs/HACKATHON_READINESS.md) — Validation gates and sub-3-minute demo script
