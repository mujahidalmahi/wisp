<div align="center">

# WISP

### **AI-Powered Contextual Viewing for Amazon Fire TV**
*"A little more, when you need it."*

[![Hackathon](https://img.shields.io/badge/Amazon_Developer_Hackathon_2026-Fire_TV_Track-FF9900?style=for-the-badge&logo=amazonfiretv&logoColor=white)](https://amazonappdev2026.devpost.com/)
[![Platform](https://img.shields.io/badge/Platform-Fire_OS_%7C_Vega_OS-1E293B?style=for-the-badge)](./docs/FIRE_TV_UX_GUIDE.md)
[![Stack](https://img.shields.io/badge/Stack-React_Native_%E2%80%A2_NestJS_%E2%80%A2_Supabase-3ECF8E?style=for-the-badge)](./docs/ARCHITECTURE.md)
[![AI Providers](https://img.shields.io/badge/AI-Groq_%E2%80%A2_Gemini_%E2%80%A2_OpenRouter-38BDF8?style=for-the-badge)](./docs/AI_ENGINE_GUIDE.md)

[**Project Proposal**](./docs/PROPOSAL.md) • [**System Architecture**](./docs/ARCHITECTURE.md) • [**Database Architecture**](./docs/DATABASE_ARCHITECTURE.md) • [**API Specification**](./docs/API_SPEC.md) • [**AI Engine Guide**](./docs/AI_ENGINE_GUIDE.md) • [**Repo Instructions**](./INSTRUCTIONS.md) • [**Contributing & Team Roles**](./CONTRIBUTING.md) • [**Friction Log**](./docs/FRICTION_LOG.md)

</div>

---

## 1. Executive Summary

**Wisp** is a native **Amazon Fire TV** application centered on a single thesis: **AI-powered contextual understanding during television viewing**.

Viewers regularly lose context while watching serialized narratives, documentaries, or information-dense programs—forgetting a character, missing a relationship, needing a brief explanation of a concept, or wanting a spoiler-safe recap. Normally, answering these questions requires pausing the TV, picking up a phone, and risking major plot spoilers online.

Wisp treats the **television program, current playback position, and 5-way D-pad remote** as the primary interface—placing a fast, spoiler-safe AI assistance layer around the viewing experience that appears when useful and stays out of the way when it is not.

> **Engineering Principle:** No dummy AI responses, fake buttons, prerecorded interactions, or hardcoded outputs. Every feature is considered complete only when the full path works end-to-end:
> `Fire TV UI → Cloudflare Edge / NestJS API → Spoiler-Safe Context → Real AI Provider → 10-Foot TV Overlay`

---

## 2. Core Product & Technical Highlights

| Capability | How Wisp Implements It |
| :--- | :--- |
| **Zero-Typing 10-Foot UX** | Invoking Wisp with the Fire TV remote opens a `<100ms` Stage-1 drawer displaying the active scene header and **3–4 D-pad selectable Quick Action Chips**, plus dynamic follow-up pills on every AI card—eliminating tedious on-screen keyboard typing. |
| **Deterministic Spoiler Safety** | Spoiler protection is enforced mathematically at the data boundary (`end_time_ms <= playback_position_ms` and `reveal_time_ms <= playback_position_ms`) in both PostgreSQL ([`0002_temporal_context_functions.sql`](./supabase/migrations/0002_temporal_context_functions.sql)) and the standalone [`temporal-filter.ts`](./ai-engine/src/context/temporal-filter.ts). |
| **Temporal 16-Table Data Engine & Hybrid RAG** | PostgreSQL 15+ engine with 16 production tables, generated inclusive `int8range` scene bounds with GiST exclusion constraints, pure-SQL `float4[]` vector cosine similarity, Reciprocal Rank Fusion (RRF), zero-trust RLS policies, 4 trigger functions / 14 triggers, and 5 continuous percentile observability views ([`docs/DATABASE_ARCHITECTURE.md`](./docs/DATABASE_ARCHITECTURE.md)). |
| **Modular AI Engine (`@wisp/ai-engine`)** | All AI feature pipelines (*Contextual Q&A*, *Entity Explainer*, *Scene Explainer*, *Episode Recap*, *Interactive Quiz*), prompt builders, and model adapters live in a framework-agnostic package ([`ai-engine/`](./ai-engine/README.md)) that can be developed and tested standalone without backend or database dependencies. |
| **Household Viewing Modes** | One-click D-pad profile selector (`Quick Glance`, `Deep Lore`, `Family Mode`) dynamically tailors explanation length, tone, and vocabulary to who is watching in the living room. |
| **Resilient Multi-Provider AI Gateway** | Server-side provider abstraction routing requests through **Groq** (`llama-3.3-70b-versatile` for sub-second TV card latency) → **Google Gemini Flash** → **OpenRouter** → **Ollama** (local development fallback), fronted by **Cloudflare Workers KV** 15-second timestamp bucket caching. |

---

## 3. Monorepo Directory Structure

```text
wisp/
├── ai-engine/              # Modular AI Integration & Feature Engine (@wisp/ai-engine — zero backend/DB lock-in)
├── frontend/               # Amazon Fire TV Client (React Native / react-native-tvos + TypeScript 10-foot UI)
├── backend/                # NestJS + TypeScript Application API, Security Boundary & AI Gateway
├── supabase/               # Supabase PostgreSQL Schema Migrations, Anti-Spoiler RPCs & 3-Genre Demo Seeds
├── database/               # Destructive 8-part database integration & invariant test suite
├── cloudflare/             # Cloudflare Worker Edge Gateway (Workers KV 15s Bucket Cache & R2 Video Streamer)
├── testing/                # Comprehensive Test Suites (AI, Backend, Frontend, Database, Cloudflare, E2E)
├── docs/                   # Proposal, Architecture, API Spec, UX Guide, Branch Guides, Friction Log & Feedback
├── agents/                 # Specialized AI Agent Playbooks & Versioned Runtime Prompt Specifications
├── .github/workflows/      # Automated Continuous Integration Pipeline (ci.yml)
├── AGENTS.md               # Non-negotiable architectural & spoiler-safety invariants
├── CODE_OF_CONDUCT.md      # Team Code of Conduct & 5-Branch Repository Discipline
├── CONTRIBUTING.md         # Formal Role Distribution, Governance, Handover & Quality Gate Specification
├── INSTRUCTIONS.md         # Strict Branching, 5-Branch PR Rules, GitHub Issues & Operational Protocol
└── SECURITY.md             # Server-Side Credential Isolation, Branch Protection & Anti-Spoiler Policy
```

---

## 4. Team Organization, Role Categories & Branch Mapping

Development is organized across **five functional role categories** and **eight (8) team members**, mapped directly to dedicated repository branches. See [**`CONTRIBUTING.md`**](./CONTRIBUTING.md) for the complete governance, handover, and change-control specification.

| No. | Role Category | Assigned Team Members | Dedicated Branch & Guide | Primary Workspace Ownership |
| :-: | :--- | :--- | :--- | :--- |
| **01** | **Backend, Database & Security** | **Ashraful Araf Sami**<br/>**Mujahid Al Mahi** | **`server`**<br/>([`SERVER.md`](./docs/branches/SERVER.md)) | [`backend/`](./backend/README.md), [`database/`](./database/README.md), [`cloudflare/`](./cloudflare/README.md) |
| **02** | **AI Integration & AI Features** | **Shajid Islam Chowdhury**<br/>**Chowdhury Rifat Ahmed** | **`ai-integration`**<br/>([`AI_INTEGRATION.md`](./docs/branches/AI_INTEGRATION.md)) | [`ai-engine/`](./ai-engine/README.md), [`agents/prompts/`](./agents/README.md), [`AI_ENGINE_GUIDE.md`](./docs/AI_ENGINE_GUIDE.md) |
| **03** | **Frontend, UI/UX** | **Kazi Rahad Ali**<br/>**Shahariar Hossain Jibon** | **`client`**<br/>([`CLIENT.md`](./docs/branches/CLIENT.md)) | [`frontend/`](./frontend/README.md), [`FIRE_TV_UX_GUIDE.md`](./docs/FIRE_TV_UX_GUIDE.md) |
| **04** | **QA & Testing** | **Taufiq E Elahi** | **`testing`**<br/>([`TESTING.md`](./docs/branches/TESTING.md)) | [`testing/`](./testing/README.md), [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) |
| **05** | **Research & Documentation** | **Abduallah Al Mamun** | **`docs`**<br/>([`DOCS.md`](./docs/branches/DOCS.md)) | [`docs/`](./docs/PROPOSAL.md), [`FRICTION_LOG.md`](./docs/FRICTION_LOG.md), [`PRODUCT_FEEDBACK.md`](./docs/PRODUCT_FEEDBACK.md) |
| — | **Production Integration** | **All Category Owners** | **`main`**<br/>([`MAIN.md`](./docs/branches/MAIN.md)) | End-to-end verified releases passing the 7-Step Quality Gate |

---

## 5. Quick Start & Developer Commands

### Prerequisites
* **Node.js** `>= 20.x` (Node `24.x` recommended for native TypeScript test execution) & **npm** `>= 10.x`
* **Android Studio / ADB** (for Fire OS device or Android TV / Fire TV emulator)
* **Supabase PostgreSQL** project (or local Supabase CLI) & at least one free-tier AI key (**Groq**, **Gemini**, or **OpenRouter**) or local **Ollama**

### A. Run Standalone AI Engine & Multi-Layer Test Suite (Zero Backend / Zero DB Needed)
```bash
# 1. Run all automated test suites across AI, Backend, Frontend, DB, Edge & E2E
npm test

# 2. Run the interactive @wisp/ai-engine CLI playground
npm run ai:playground

# 3. Run domain-specific test suites
npm run test:ai
npm run test:backend
npm run test:frontend
npm run test:database
npm run test:cloudflare
npm run test:e2e
```

### B. Run Full-Stack Application Locally
```bash
# 1. Install workspace dependencies
npm install

# 2. Configure environment variables
cp .env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Start NestJS Backend & AI Gateway (http://localhost:3000/api/v1)
npm run dev:backend

# 4. Start React Native Metro Bundler & Launch on Fire TV Emulator/Device
npm run dev:frontend
npm run android:firetv
```

---

## 6. Documentation & Submission Artifacts

| Document | Description |
| :--- | :--- |
| [**`INSTRUCTIONS.md`**](./INSTRUCTIONS.md) | Strict 5-Branch Pull Request Policy, Two-Stage Merge Flow, GitHub Issues Use Cases & Operational Rules. |
| [**`CONTRIBUTING.md`**](./CONTRIBUTING.md) | Formal Role Distribution, Work Coordination Framework, Change-Control Matrix, and Quality Gates. |
| [**`docs/PROPOSAL.md`**](./docs/PROPOSAL.md) | Refined project proposal, hackathon alignment, functional scope, and cost-control strategy. |
| [**`docs/ARCHITECTURE.md`**](./docs/ARCHITECTURE.md) | End-to-end data flow, temporal anti-spoiler architecture, and AI provider routing matrix. |
| [**`docs/DATABASE_ARCHITECTURE.md`**](./docs/DATABASE_ARCHITECTURE.md) | Production 16-table PostgreSQL schema, GiST temporal exclusion constraints, pure-SQL hybrid RRF search, zero-trust RLS matrix, and 8-suite test harness. |
| [**`docs/AI_ENGINE_GUIDE.md`**](./docs/AI_ENGINE_GUIDE.md) | Developer guide for building standalone AI features and model adapters in `@wisp/ai-engine`. |
| [**`docs/API_SPEC.md`**](./docs/API_SPEC.md) | Production REST API contracts (19 endpoints across 6 controllers: Health, AI Gateway, Auth, Catalog, Context, Profiles), 15 PostgreSQL RPCs, and `@wisp/ai-engine` SDK. |
| [**`docs/FIRE_TV_UX_GUIDE.md`**](./docs/FIRE_TV_UX_GUIDE.md) | 10-foot typography scales, 5% overscan safe zones, and Fire TV remote D-pad key mappings. |
| [**`docs/FRICTION_LOG.md`**](./docs/FRICTION_LOG.md) | Engineering Friction Log documenting expected vs. actual behavior and workarounds (**10% judging bonus**). |
| [**`docs/PRODUCT_FEEDBACK.md`**](./docs/PRODUCT_FEEDBACK.md) | Evaluation of Fire TV React Native tooling, `@wisp/ai-engine`, NestJS, Supabase, and Cloudflare. |
| [**`docs/HACKATHON_READINESS.md`**](./docs/HACKATHON_READINESS.md) | Pre-submission checklist and `<3 minute` demonstration video script. |

---

## License

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for details.
