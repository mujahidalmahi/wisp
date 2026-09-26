# Contributing & Work Coordination Charter — Wisp

> **Formal Role Distribution, Work Coordination Framework & Quality Gate Specification**
> **Project:** Wisp — *AI-Powered Contextual Viewing for Amazon Fire TV*
> **Program / Track:** Amazon Developer Hackathon 2026 — Fire TV Track

> [!IMPORTANT]
> **Mandatory Branching & Pull Request Policy ([`INSTRUCTIONS.md`](./INSTRUCTIONS.md)):**
> * **Only the 5 official Category Branches (`server`, `ai-integration`, `client`, `testing`, `docs`) may open Pull Requests into `main`.**
> * Any Pull Request targeting `main` directly from an **individual developer branch** or an **external fork** will be **closed and rejected immediately**. Individual branches must merge into their parent Category Branch first, and the Category Branch then opens the PR to `main`.
> * See [**`INSTRUCTIONS.md`**](./INSTRUCTIONS.md) for full branching & GitHub Issue rules, [**`CODE_OF_CONDUCT.md`**](./CODE_OF_CONDUCT.md) for team conduct, and [**`SECURITY.md`**](./SECURITY.md) for credential and anti-spoiler policies.

This document establishes the formal distribution of functional ownership, responsibilities, branch workflows, change-control protocols, handover requirements, and completion gates for the **eight (8) member Wisp engineering team**.

---

## 1. Functional Role Distribution Overview

Work is organized across **five functional role categories** aligned directly with Wisp's technical architecture and repository branches:

| No. | Role Category | Assigned Members | Branch | Primary Scope |
| :-: | :--- | :--- | :--- | :--- |
| **01** | **Backend, Database & Security** | **Ashraful Araf Sami**<br/>**Mujahid Al Mahi** | `server` | Backend services, APIs, Supabase PostgreSQL database, data handling, Cloudflare edge caching, security, and deployment requirements. |
| **02** | **AI Integration & AI Features** | **Shajid Islam Chowdhury**<br/>**Chowdhury Rifat Ahmed** | `ai-integration` | Modular `@wisp/ai-engine` integration, AI-powered features, spoiler-safe temporal context handling, and multi-provider interaction. |
| **03** | **Frontend, UI/UX** | **Kazi Rahad Ali**<br/>**Shahariar Hossain Jibon** | `client` | Fire TV React Native interface, spatial focus navigation, remote/D-pad interaction, and 10-foot overlay presentation. |
| **04** | **QA & Testing** | **Taufiq E Elahi** | `testing` | Functional, integration, regression, platform, and release testing across all layers (`testing/`). |
| **05** | **Research & Documentation** | **Abduallah Al Mamun** | `docs` | Platform research, technical records, friction logs, architecture documentation, and hackathon submission materials. |

---

## 2. Detailed Role Category Mandates & Deliverables

### 2.1 Role Category I — Backend, Database & Security (`server` Branch)
* **Assigned Members:** Ashraful Araf Sami, Mujahid Al Mahi
* **Category Mandate:** Own the server-side foundation of Wisp, including application APIs, business logic, persistent data, secure configuration, service boundaries, and security controls.
* **Principal Responsibilities:**
  * Design and implement NestJS backend services and application APIs (`backend/`).
  * Define API contracts, request/response structures, validation rules, status/error behavior, and service boundaries.
  * Design and maintain the Supabase PostgreSQL schema, relationships, constraints, temporal indexes, migrations, and `get_spoiler_safe_context` RPC (`database/`).
  * Manage persistent data for household profiles, content metadata, program context, and interaction history.
  * Keep AI provider credentials and provider-specific communication strictly server-side.
  * Maintain Cloudflare Worker edge caching, rate limiting, logging, and deployment configuration (`cloudflare/`).
* **Principal Deliverables:**
  * Working NestJS service and REST API layer (`/api/v1/*`).
  * Production-oriented Supabase PostgreSQL schema, migrations, and 3-genre demo seeds.
  * Secure application boundary for AI services with documented API and error contracts.

---

### 2.2 Role Category II — AI Integration & AI Features (`ai-integration` Branch)
* **Assigned Members:** Shajid Islam Chowdhury, Chowdhury Rifat Ahmed
* **Category Mandate:** Own the implementation and integration of Wisp's AI-powered capabilities in [`@wisp/ai-engine`](./ai-engine/README.md). AI work must remain strictly grounded in temporal program context (`00:00 → playbackPositionMs`) and exposed cleanly through the backend architecture.
* **Principal Responsibilities:**
  * Implement all scoped AI-powered capabilities (*Contextual Q&A*, *Entity Explainer*, *Scene Explainer*, *Episode Recap*, *Post-Watch Interactive Quiz*) inside `ai-engine/src/features/`.
  * Integrate real AI providers (`Groq`, `Google Gemini Flash`, `OpenRouter`, and local `Ollama`) inside `ai-engine/src/providers/`.
  * Define structured JSON AI requests, temporal anti-spoiler context filtering (`temporal-filter.ts`), response parsing, and fallback behavior.
  * Support provider routing, automatic failover, 15-second timestamp bucket caching, latency optimization, and cost-control safeguards.
  * Coordinate AI-specific test scenarios and edge cases with **QA & Testing**.
* **Principal Deliverables:**
  * Working modular AI feature integrations (`@wisp/ai-engine`) and CLI playground (`npm run ai:playground`).
  * Validated real-provider routing and automatic fallback chain.
  * Documented AI request/response contracts and prompt specifications (`agents/prompts/`, `docs/AI_ENGINE_GUIDE.md`).

---

### 2.3 Role Category III — Frontend, UI/UX (`client` Branch)
* **Assigned Members:** Kazi Rahad Ali, Shahariar Hossain Jibon
* **Category Mandate:** Own the Fire TV user interface and 10-foot interaction experience, including remote/D-pad spatial focus navigation, screen structure, visual presentation, contextual overlays, and user-facing application states.
* **Principal Responsibilities:**
  * Implement the Fire TV client using React Native (`react-native-tvos`) + TypeScript (`frontend/`).
  * Implement predictable remote/D-pad focus navigation (`useTVRemoteHandler`, `hasTVPreferredFocus`) and high-contrast focus rings.
  * Build viewing screens, the Two-Stage Instant `WispOverlayDrawer`, `QuickActionChips`, `ProfileModeSelector`, and post-watch trivia cards.
  * Integrate real backend and AI responses into the interface, including loading, success, empty, error, timeout, and recovery states.
  * Maintain 10-foot distance readability (`>= 22sp` body text, 5% overscan safe margins) and minimal disruption to video playback.
* **Principal Deliverables:**
  * Functional, installable Fire TV client with remote-friendly navigation and focus behavior.
  * Integrated Two-Stage Instant UI and AI result card presentation.
  * Polished, submission-ready demonstration flow.

---

### 2.4 Role Category IV — QA & Testing (`testing` Branch)
* **Assigned Member:** Taufiq E Elahi
* **Category Mandate:** Independently verify that implemented functionality behaves as intended across all layers and that the integrated product is suitable for demonstration and hackathon submission.
* **Principal Responsibilities:**
  * Prepare and maintain the structured multi-layer automated test suite in [`testing/`](./testing/README.md).
  * Test complete `Frontend → Backend → Temporal Context/Data → AI Engine → Frontend` flows.
  * Verify Fire TV navigation, D-pad focus behavior, remote interaction, 10-foot readability, and playback interruption behavior.
  * Test normal, invalid, empty, timeout, provider-unavailable, and recovery scenarios.
  * Record defects with reproduction steps, expected vs. actual behavior, severity, and verification status, and conduct regression testing after fixes.
* **Principal Deliverables:**
  * Automated test suites (`npm test`) covering `ai-integration`, `backend`, `frontend`, `database`, `cloudflare`, and `full-application` E2E flows.
  * Defect/issue register, regression verification records, and release-readiness assessment.

---

### 2.5 Role Category V — Research & Documentation (`docs` Branch)
* **Assigned Member:** Abduallah Al Mamun
* **Category Mandate:** Maintain the authoritative research record, technical documentation, project history, implementation evidence, friction logs, and submission materials required for the project.
* **Principal Responsibilities:**
  * Research Fire TV/platform constraints, runtime considerations, and hackathon submission requirements.
  * Maintain functional and technical documentation in [`docs/`](./docs/PROPOSAL.md) (`PROPOSAL.md`, `ARCHITECTURE.md`, `API_SPEC.md`, `FIRE_TV_UX_GUIDE.md`, `AI_ENGINE_GUIDE.md`).
  * Maintain [`docs/FRICTION_LOG.md`](./docs/FRICTION_LOG.md) (qualifying for up to a **10% judging bonus**) and [`docs/PRODUCT_FEEDBACK.md`](./docs/PRODUCT_FEEDBACK.md).
  * Coordinate with each role category to capture actual implementation status, known limitations, and setup procedures.
  * Prepare final presentation, `<3 minute` demonstration script (`docs/HACKATHON_READINESS.md`), and Devpost submission materials.
* **Principal Deliverables:**
  * Complete architecture, API, setup, and feature documentation package.
  * Verified Developer Friction Log and Product Feedback reports.
  * Final hackathon presentation and submission package.

---

## 3. Work Coordination & Change-Control Framework

### 3.1 Core Coordination Principles
1. Every major feature must have a defined user outcome and explicit acceptance criteria before implementation.
2. Shared API and AI contracts (`wisp-query.dto.ts`, `ai-engine/src/types/index.ts`) must be established before dependent integration is finalized.
3. Frontend, backend, and AI work must be integrated early rather than only at the end of development.
4. Security and spoiler-safety requirements must be enforced during implementation rather than after feature completion.
5. **No category may silently change a shared contract without notifying affected categories.**

### 3.2 Change-Control Matrix

| Change Type | Minimum Coordination Required |
| :--- | :--- |
| **API Contract** | `Backend` → `Frontend`, `AI Integration`, `QA & Testing`, `Research & Documentation` |
| **Database / Schema** | `Backend` → `AI Integration`, `QA & Testing`, `Research & Documentation` (`Frontend` if payloads change) |
| **AI Response / Schema** | `AI Integration` → `Frontend`, `Backend`, `QA & Testing`, `Research & Documentation` |
| **UI / Navigation** | `Frontend` → `QA & Testing` (`AI Integration` / `Backend` if trigger or payload behavior changes) |
| **Security / Configuration** | `Backend & Security` → `QA & Testing` and all affected integration owners |
| **Feature Scope** | Affected Category Owners → `Research & Documentation` for authoritative record update |

---

## 4. Work Flow & Delivery Procedure

### 4.1 Project-Level Delivery Stages

| Stage | Responsible Category | Required Output |
| :--- | :--- | :--- |
| **1. Research & Scope** | Research & Documentation | Requirements, Fire TV constraints, references, approved scope (`docs/PROPOSAL.md`). |
| **2. Architecture & Contracts** | Backend + AI Integration | Data flow, REST DTO contracts, `@wisp/ai-engine` interfaces, technical decisions (`docs/ARCHITECTURE.md`). |
| **3. UI/UX Definition** | Frontend, UI/UX | 10-foot screen layouts, D-pad focus rules, Two-Stage Instant overlay flow (`docs/FIRE_TV_UX_GUIDE.md`). |
| **4. Backend & Database** | Backend, Database & Security | NestJS APIs, Supabase schema/RPCs, validation, secure service boundary (`backend/`, `database/`). |
| **5. AI Integration** | AI Integration & AI Features | Real AI feature pipelines, temporal anti-spoiler filtering, provider fallback (`ai-engine/`). |
| **6. Frontend Integration** | Frontend, UI/UX | Connected Fire TV player and contextual overlay flow (`frontend/`). |
| **7. End-to-End Validation** | QA & Testing | Multi-layer test execution, defect verification, regression sign-off (`testing/`). |
| **8. Stabilization** | All Relevant Owners | Latency, security, 10-foot readability, and fallback reliability refinements. |
| **9. Documentation & Submission** | Research & Documentation | Final documentation, friction log, product feedback, and `<3 minute` demo video. |

### 4.2 Ten-Step Feature-Level Workflow
1. **Define** the feature objective, user outcome, acceptance criteria, and scope.
2. **Identify** required content/context, database fields, APIs, AI behavior, and Fire TV remote interactions.
3. **Agree** on the shared TypeScript contracts between Backend, AI Integration, and Frontend.
4. **Implement** backend and database requirements (`server` branch).
5. **Implement & validate** the modular AI feature path in `@wisp/ai-engine` (`ai-integration` branch).
6. **Implement** the Fire TV 10-foot interaction and card presentation (`client` branch).
7. **Integrate** all components into one end-to-end working path.
8. **Perform** functional, failure-mode, and regression testing (`testing` branch).
9. **Resolve** defects and repeat relevant validation.
10. **Update** documentation (`docs` branch) and mark the feature complete only after passing the Quality Gate.

---

## 5. Work Handover Requirements

Every cross-category handover must include sufficient detail so the receiving team can continue work without undocumented assumptions:

| From | To | Minimum Required Handover Information |
| :--- | :--- | :--- |
| **Research & Documentation** | All Categories | Approved requirements, scope boundaries, platform constraints, references, and decisions. |
| **Backend** | Frontend | Endpoint URL, HTTP method, request/response DTOs, status/error codes, and session behavior. |
| **Backend** | AI Integration | Context/data availability (`HybridContextSource`), service boundary, rate limits, and env configuration. |
| **AI Integration** | Frontend | Feature action types (`WispActionType`), response card structure (`WispResponseCard`), loading and fallback behavior. |
| **AI Integration** | QA & Testing | Representative test prompts, expected grounded outputs, spoiler boundaries, and provider failover cases. |
| **Frontend** | QA & Testing | Testable build/branch, D-pad navigation map, interaction expectations, and known UI limitations. |
| **QA & Testing** | Relevant Owners | Defect details, severity (`Blocker` / `High` / `Medium` / `Low`), reproduction steps, and verification results. |
| **All Categories** | Documentation | Actual implementation status, architectural changes, workarounds (`docs/FRICTION_LOG.md`), and setup steps. |

---

## 6. Quality Gate & Definition of Completion

### 6.1 Seven-Step Working-Feature Quality Gate
A major feature is **never** considered complete solely because an isolated component compiles. Every pull request into `main` must satisfy all 7 steps:
1. **Invokable on Fire TV UI:** Triggerable via Fire TV remote / D-pad with visible focus ring.
2. **Reaches Real Backend:** Request hits the NestJS API or Cloudflare Edge gateway.
3. **Real Temporal Context:** Retrieves real program data strictly bounded by `playbackPositionMs` (`end_time_ms <= playbackPositionMs`).
4. **Real AI Provider:** Uses a live AI provider (`Groq`, `Gemini`, `OpenRouter`) or validated local `Ollama` model—never hardcoded outputs.
5. **Consumed by Application:** Returned JSON card is parsed and state-managed dynamically by the client.
6. **Visible on 10-Foot Environment:** Presented legibly on the Fire TV device or simulator with clean focus return to playback.
7. **Graceful Failure Handling:** Timeouts, rate limits, and offline states are handled cleanly without pretending success.

### 6.2 Nine-Point Definition of Completion
A feature may be marked **Complete** only when:
- [x] Implemented in the actual project stack (`React Native + NestJS + Supabase + @wisp/ai-engine`).
- [x] Required frontend, backend, database, and AI components are integrated.
- [x] Follows the real application path with zero hardcoded AI behavior.
- [x] Both success and failure states are handled gracefully.
- [x] Security and server-side credential isolation have been reviewed.
- [x] **QA & Testing** has executed the workflow (`npm test`) and verified critical fixes.
- [x] Final behavior and API contracts are documented in `docs/`.
- [x] Demonstrable on the target Fire TV environment or validated simulator.
- [x] Known limitations and developer friction are recorded in [`docs/FRICTION_LOG.md`](./docs/FRICTION_LOG.md) rather than concealed.

---

## 7. Internal Governance & Accountability

1. **Category Ownership:** Each role category is accountable for the engineering quality and completeness of its assigned scope.
2. **Cross-Category Collaboration:** Category ownership does not restrict collaboration; members may assist outside their primary category when needed for integration or deadlines.
3. **Contract Communication:** Any change affecting another category must be communicated before being treated as final.
4. **QA Authority:** **QA & Testing** (Taufiq E Elahi) holds authority to flag and return incomplete functionality when defined acceptance criteria or the 7-Step Quality Gate are not satisfied.
5. **Authoritative Record:** **Research & Documentation** (Abduallah Al Mamun) maintains the authoritative written record of approved scope, implementation status, friction logs, and hackathon submission deliverables.
