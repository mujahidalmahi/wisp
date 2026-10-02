# Security & Spoiler-Safety Policy — Wisp

> **Application Security, Credential Isolation, Branch Protection & Temporal Data Boundaries**
> **Project:** Wisp — *AI-Powered Contextual Viewing for Amazon Fire TV*

This document defines the security architecture, credential handling rules, branch protection policies, and deterministic spoiler-safety boundaries for the **Wisp** monorepo.

---

## 1. Supported Versions & Protected Branches

Security and spoiler-safety controls are enforced across `main` and all five (5) official functional category branches:

| Branch | Scope | Security Enforcement Status |
| :--- | :--- | :---: |
| **`main`** | Production Release & Integration Branch | Protected (CI + 7-Step Gate Required) |
| **`server`** | Backend (`backend/`), Database (`database/`), Edge (`cloudflare/`) | Active (`Category 01` — Ashraful Araf Sami, Mujahid Al Mahi) |
| **`ai-integration`** | Modular AI Engine (`ai-engine/`), Prompts (`agents/prompts/`) | Active (`Category 02` — Shajid Islam Chowdhury, Chowdhury Rifat Ahmed) |
| **`client`** | Amazon Fire TV React Native Client (`frontend/`) | Active (`Category 03` — Kazi Rahad Ali, Shahariar Hossain Jibon) |
| **`testing`** | Multi-Layer Verification & Security Test Suites (`testing/`) | Active (`Category 04` — Taufiq E Elahi) |
| **`docs`** | Architecture, API & Friction Documentation (`docs/`) | Active (`Category 05` — Abduallah Al Mamun) |

### Branch Protection & Pull Request Security
* **Zero External / Unverified PRs to `main`:** Pull Requests targeting `main` from any individual developer branch, unregistered branch, or external fork are **strictly prohibited and closed immediately** (see [`INSTRUCTIONS.md`](./INSTRUCTIONS.md#1-strict-branching-hierarchy--pull-request-policy)).
* **Two-Stage Review:** All code must first be merged and reviewed inside one of the 5 official Category Branches before a Category-to-`main` Pull Request is opened.

---

## 2. Server-Side Credential & Secret Isolation

### 2.1 Strict Client/Server Secret Boundary
The Amazon Fire TV client (`frontend/`) runs on end-user devices and emulators. Therefore, **zero secrets or third-party AI/database credentials may ever exist inside `frontend/`**:

| Variable / Secret | Allowed Location | Forbidden Location |
| :--- | :--- | :--- |
| `GROQ_API_KEY` | `backend/.env`, Cloudflare Secrets | **NEVER** in `frontend/` or Git |
| `GEMINI_API_KEY` | `backend/.env`, Cloudflare Secrets | **NEVER** in `frontend/` or Git |
| `OPENROUTER_API_KEY` | `backend/.env`, Cloudflare Secrets | **NEVER** in `frontend/` or Git |
| `SUPABASE_SERVICE_ROLE_KEY` | `backend/.env` | **NEVER** in `frontend/` or Git |
| `WISP_API_BASE_URL` | `frontend/.env` (Public Gateway URL only) | Safe public endpoint |

### 2.2 Secret Management Rules
1. **Never Commit `.env` Files:** `.gitignore` blocks `.env`, `.env.*`, and `.dev.vars`. Only sanitized templates (`.env.example` and `frontend/.env.example`) may be committed.
2. **Immediate Key Rotation:** If any API key or token is accidentally committed to any branch, it must be revoked and rotated immediately in the provider console (Groq, Google AI Studio, OpenRouter, Supabase, or Cloudflare), and a `[BUG][BLOCKER][server]` Issue must be opened.

---

## 3. Deterministic Anti-Spoiler Data Security

In Wisp, **leaking future plot spoilers is treated as a P0 data-boundary security vulnerability**.

### 3.1 Dual-Layer Temporal Enforcement
Spoiler protection is never entrusted solely to LLM prompt instructions. It is enforced deterministically at two independent layers before any LLM call occurs:

1. **PostgreSQL Database Boundary ([`0002_temporal_context_functions.sql`](./supabase/migrations/0002_temporal_context_functions.sql)):**
   * The `get_spoiler_safe_context(p_episode_id, p_playback_position_ms, p_window_ms)` RPC filters out all rows where:
     * `transcript_lines.end_time_ms > p_playback_position_ms`
     * `scenes.start_time_ms > p_playback_position_ms`
     * `entity_lore.reveal_time_ms > p_playback_position_ms`
2. **Standalone AI Engine Boundary ([`temporal-filter.ts`](./ai-engine/src/context/temporal-filter.ts)):**
   * `filterTemporalContext(episode, playbackPositionMs, windowMs)` re-verifies every transcript segment, scene summary, and lore entry in pure TypeScript and strips any future data prior to prompt assembly.

### 3.2 Automated CI Enforcement
Every Pull Request runs [`testing/ai-integration/temporal-filter.test.ts`](./testing/ai-integration/temporal-filter.test.ts) and [`testing/database/schema-and-rpc.test.ts`](./testing/database/schema-and-rpc.test.ts) via GitHub Actions ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) to guarantee zero future data leakage.

---

## 4. Database Row-Level Security (RLS) & API Validation

1. **Supabase PostgreSQL RLS ([`0001_initial_wisp_schema.sql`](./supabase/migrations/0001_initial_wisp_schema.sql)):**
   * Row-Level Security is enabled on all core tables (`media_catalog`, `episodes`, `scenes`, `transcript_lines`, `entities`, `entity_lore`, `household_profiles`, `wisp_interaction_logs`).
   * Public clients have read-only access to catalog metadata; write operations require the server-side `service_role` key inside `backend/`.
2. **Strict DTO Input Validation ([`wisp-query.dto.ts`](./backend/src/common/dto/wisp-query.dto.ts)):**
   * All incoming `/api/v1/wisp/query` payloads are validated via NestJS `ValidationPipe` (`whitelist: true`, `forbidNonWhitelisted: true`), enforcing non-negative `playbackPositionMs`, valid `actionType` enums, and bounded `customQuery` lengths (`<= 300` characters).

---

## 5. Reporting a Security or Spoiler-Safety Vulnerability

If you discover a credential exposure, API validation bypass, or temporal spoiler leak:
1. **For Spoiler-Safety or Internal Defects:** Open a `[SPOILER-SAFETY]` or `[BUG][BLOCKER][server]` Issue immediately following the format in [`INSTRUCTIONS.md`](./INSTRUCTIONS.md#3-proper-use-cases--protocol-for-github-issues) and tag the **Backend, Database & Security** (`server`) and **QA & Testing** (`testing`) owners.
2. **For Sensitive Credential Leaks:** Do **not** paste live keys into a public GitHub Issue. Immediately notify the `server` branch owners (**Ashraful Araf Sami** & **Mujahid Al Mahi**) to rotate the affected credentials.
