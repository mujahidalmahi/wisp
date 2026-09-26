# Repository Operational Instructions & Governance Rules — Wisp

> **Mandatory Engineering, Branching, Pull Request, and Issue Management Protocol**
> **Project:** Wisp — *AI-Powered Contextual Viewing for Amazon Fire TV*
> **Repository:** [`github.com/mujahidalmahi/wisp`](https://github.com/mujahidalmahi/wisp)

This document defines the **strict operational rules** governing how code is written, branched, reviewed, tracked through GitHub Issues, and merged in the Wisp repository. Every team member and contributor must follow these instructions without exception.

---

## 1. Strict Branching Hierarchy & Pull Request Policy

The Wisp repository enforces a **strict Two-Tier Branching Model** built around **one production branch (`main`)** and **five (5) official functional category branches**.

### 1.1 The Only Authorized Branches
| Branch Type | Branch Name(s) | Purpose & Authority |
| :--- | :--- | :--- |
| **Production Branch** | `main` | Protected integration & release branch. Always deployable, tested, and submission-ready. |
| **Official Category Branches (5)** | `server`<br/>`ai-integration`<br/>`client`<br/>`testing`<br/>`docs` | Dedicated integration branches for the 5 functional role categories (see Section 2). **ONLY these 5 branches are permitted to open Pull Requests into `main`.** |
| **Individual / Sub-Feature Branches** | e.g., `mahi/auth-guard`, `sami/db-rpc`, `rahad/tv-drawer` | Temporary developer working branches. **Must merge into one of the 5 Category Branches — NEVER directly into `main`.** |

---

### 1.2 Non-Negotiable Pull Request Rules

> [!IMPORTANT]
> **RULE 1 — NO DIRECT PULL REQUESTS TO `main` FROM INDIVIDUAL OR EXTERNAL BRANCHES:**
> Any Pull Request opened toward `main` from an **individual developer branch**, an **ad-hoc feature/bugfix branch** (e.g., `feat/*`, `fix/*`, `dev/*`), or an **external fork / third-party repository** will be **automatically rejected and closed without review**.

> [!IMPORTANT]
> **RULE 2 — ONLY THE 5 CATEGORY BRANCHES MAY TARGET `main`:**
> A Pull Request targeting `main` is valid **if and only if** its source (`head`) branch is one of the **5 official category branches** inside this repository:
> 1. `server` → `main`
> 2. `ai-integration` → `main`
> 3. `client` → `main`
> 4. `testing` → `main`
> 5. `docs` → `main`

> [!IMPORTANT]
> **RULE 3 — TWO-STAGE MERGE WORKFLOW (Individual → Category Branch → `main`):**
> All code contributions must follow this exact two-stage path:
> * **Stage 1 (Individual Work → Category Branch):**
>   * Developers either commit scoped work on their assigned Category Branch or create a short-lived individual branch off their Category Branch (e.g., branching `sami/MigrationFix` from `server`).
>   * Individual branches **must open a Pull Request into their parent Category Branch** (`individual-branch` → `server` / `ai-integration` / `client` / `testing` / `docs`), where the category co-owner reviews and merges it.
> * **Stage 2 (Category Branch → `main`):**
>   * Once the feature or milestone is complete, integrated, and passing `npm test` on the Category Branch, the Category Owners open an official Pull Request **from the Category Branch into `main`**.

```text
  [Individual Branch]          [5 Official Category Branches]          [Production]
  ┌─────────────────┐          ┌────────────────────────────┐
  │ mahi/edge-cache ├─────────►│           server           ├─────────┐
  └─────────────────┘   PR 1   └────────────────────────────┘         │
  ┌─────────────────┐          ┌────────────────────────────┐         │
  │ shajid/groq-llm ├─────────►│       ai-integration       ├─────────┤
  └─────────────────┘   PR 1   └────────────────────────────┘         │    PR 2
  ┌─────────────────┐          ┌────────────────────────────┐         ├───────────► ┌────────┐
  │ rahad/dpad-ui   ├─────────►│           client           ├─────────┤  (Allowed)  │  main  │
  └─────────────────┘   PR 1   └────────────────────────────┘         │             └────────┘
  ┌─────────────────┐          ┌────────────────────────────┐         │
  │ taufiq/e2e-spec ├─────────►│          testing           ├─────────┤
  └─────────────────┘   PR 1   └────────────────────────────┘         │
  ┌─────────────────┐          ┌────────────────────────────┐         │
  │ mamun/arch-docs ├─────────►│            docs            ├─────────┘
  └─────────────────┘   PR 1   └────────────────────────────┘

  ❌ FORBIDDEN: [Individual Branch / External Fork] ──────────────────────────────► [main] (REJECTED)
```

---

## 2. The 5 Category Branches & File Ownership Rules

Every branch in this repository contains the **complete monorepo** so that merging between branches never deletes files. However, each Category Branch is strictly scoped to modify only its owned directories:

| Category Branch | Assigned Team Members | Allowed Directories to Modify | Branch Runbook |
| :--- | :--- | :--- | :--- |
| **`server`** | **Ashraful Araf Sami**<br/>**Mujahid Al Mahi** | `backend/`, `database/`, `cloudflare/`, `.env.example` | [`docs/branches/SERVER.md`](./docs/branches/SERVER.md) |
| **`ai-integration`** | **Shajid Islam Chowdhury**<br/>**Chowdhury Rifat Ahmed** | `ai-engine/`, `agents/prompts/`, `docs/AI_ENGINE_GUIDE.md` | [`docs/branches/AI_INTEGRATION.md`](./docs/branches/AI_INTEGRATION.md) |
| **`client`** | **Kazi Rahad Ali**<br/>**Shahariar Hossain Jibon** | `frontend/`, `docs/FIRE_TV_UX_GUIDE.md` | [`docs/branches/CLIENT.md`](./docs/branches/CLIENT.md) |
| **`testing`** | **Taufiq E Elahi** | `testing/`, `.github/workflows/ci.yml` | [`docs/branches/TESTING.md`](./docs/branches/TESTING.md) |
| **`docs`** | **Abduallah Al Mamun** | `docs/`, `README.md`, `CONTRIBUTING.md`, `INSTRUCTIONS.md` | [`docs/branches/DOCS.md`](./docs/branches/DOCS.md) |

### Monorepo Integrity Rules
1. **Never Delete Unrelated Directories:** Do not delete `frontend/` on the `server` branch or delete `backend/` on the `client` branch. All 6 branches must retain the full monorepo structure at all times.
2. **Cross-Boundary Edits Require Coordination:** If your feature requires a change outside your owned directories (for example, `ai-integration` needing a new field in `backend/src/common/dto/wisp-query.dto.ts`), open a **Contract Change Issue** (see Section 3.2) and coordinate with the owning category first.

---

## 3. Proper Use Cases & Protocol for GitHub Issues

GitHub Issues are the **single source of truth** for task tracking, bug reporting, contract changes, and QA sign-off. **No Pull Request into `main` will be merged unless it links to an active GitHub Issue (`Closes #ID` or `Part of #ID`).**

### 3.1 When You MUST Open an Issue
Every contributor must open or be assigned a GitHub Issue before starting work on any of the following use cases:

#### Use Case 1: Feature Implementation (`[FEATURE]`)
* **When to use:** Building any user-facing or architectural capability across `server`, `ai-integration`, `client`, `testing`, or `docs`.
* **Required Title Format:** `[FEATURE][<branch>] Short descriptive title`
  * *Example:* `[FEATURE][ai-integration] Add Gemini 2.0 Flash failover adapter in ProviderRouter`
* **Required Contents:**
  * Target Category Branch (`server`, `ai-integration`, `client`, `testing`, or `docs`)
  * Assigned Team Member(s)
  * User/System Outcome & Acceptance Criteria
  * Affected directories and files

#### Use Case 2: Bug or Regression Defect (`[BUG]`)
* **When to use:** Reporting broken functionality, failing tests, D-pad focus traps, crashes, API timeouts, or UI rendering issues.
* **Required Title Format:** `[BUG][<severity>][<branch>] Short description of defect`
  * *Example:* `[BUG][HIGH][client] Focus ring disappears when returning from WispOverlayDrawer to playback`
* **Severity Levels:**
  * `BLOCKER`: Breaks end-to-end demo flow, causes app crash, or leaks spoilers. Blocks all merges to `main`.
  * `HIGH`: Major feature path broken or 10-foot UI unreadable without workaround.
  * `MEDIUM`: Partial degradation with an available fallback.
  * `LOW`: Minor visual polish or non-critical typo.
* **Required Contents:**
  * Exact reproduction steps (including `episodeId`, `playbackPositionMs`, and remote key sequence)
  * Expected behavior vs. Actual behavior
  * Logs, test failure output, or screenshot

#### Use Case 3: Cross-Category Contract Change Request (`[CONTRACT]`)
* **When to use:** Whenever a change affects shared interfaces between two or more branches—such as REST API endpoints (`/api/v1/wisp/query`), TypeScript DTOs (`wisp-query.dto.ts`), AI response schemas (`WispResponseCard`), or database RPC signatures (`get_spoiler_safe_context`).
* **Required Title Format:** `[CONTRACT][<from-branch> -> <to-branch>] Summary of interface change`
  * *Example:* `[CONTRACT][ai-integration -> client] Add followUpActions chip array to WispResponseCard`
* **Required Contents:**
  * Exact before/after TypeScript or SQL payload diff
  * Tagged reviewers from every affected category (per the Change-Control Matrix in [`CONTRIBUTING.md`](./CONTRIBUTING.md#32-change-control-matrix))
  * Sign-off comments from affected category owners before merging

#### Use Case 4: Spoiler-Safety Breach (`[SPOILER-SAFETY]`)
* **When to use:** Immediately if any test, prompt, database query, or AI response exposes plot points, character twists, or transcript lines where `end_time_ms > playbackPositionMs` or `reveal_time_ms > playbackPositionMs`.
* **Required Title Format:** `[SPOILER-SAFETY] Description of temporal leak`
* **Protocol:** Treated as an automatic **P0 Blocker**. Must be verified by both `ai-integration` and `testing` before closing.

#### Use Case 5: Developer Friction & Platform Quirk (`[FRICTION]`)
* **When to use:** Whenever a developer encounters an SDK quirk, Fire OS / React Native TV focus issue, Node.js runtime behavior, Supabase edge case, or AI provider rate-limit quirk during development.
* **Required Title Format:** `[FRICTION][FL-00X] Brief description of platform/SDK friction`
* **Protocol:** Assigned to **Research & Documentation** (`docs` branch — Abduallah Al Mamun) so it is formally recorded in [`docs/FRICTION_LOG.md`](./docs/FRICTION_LOG.md) and [`docs/PRODUCT_FEEDBACK.md`](./docs/PRODUCT_FEEDBACK.md) (worth up to a **10% Hackathon Judging Bonus**).

#### Use Case 6: QA Release Gate & Handover Verification (`[QA-GATE]`)
* **When to use:** Opened when a Category Branch is ready for end-to-end verification by **QA & Testing** (`testing` branch — Taufiq E Elahi) before merging into `main`.
* **Required Title Format:** `[QA-GATE][<branch> -> main] Release verification for <milestone/feature>`

---

### 3.2 Standard GitHub Issue Labels
Use these labels consistently on every GitHub Issue and Pull Request:

| Label Category | Labels |
| :--- | :--- |
| **Branch / Category** | `branch: server`, `branch: ai-integration`, `branch: client`, `branch: testing`, `branch: docs` |
| **Issue Type** | `type: feature`, `type: bug`, `type: contract`, `type: spoiler-safety`, `type: friction-log`, `type: qa-gate` |
| **Severity / Priority** | `priority: blocker`, `priority: high`, `priority: medium`, `priority: low` |
| **Workflow Status** | `status: triage`, `status: in-progress`, `status: needs-qa`, `status: ready-for-main` |

---

## 4. Step-by-Step Developer Workflow

Follow these exact steps for daily development to stay compliant with repository rules:

### Step 1: Sync Your Category Branch with `main`
Before starting new work, always make sure your assigned Category Branch has the latest verified changes from `main`:
```bash
git checkout <your-category-branch>   # server | ai-integration | client | testing | docs
git pull origin <your-category-branch>
git merge origin/main
```

### Step 2: Develop on Your Category Branch (or an Individual Sub-Branch)
* **Option A (Direct Category Collaboration):** Coordinate with your category co-owner and commit directly to your assigned Category Branch (`server`, `ai-integration`, `client`, `testing`, or `docs`).
* **Option B (Individual Sub-Branch → Category Branch):** Create a local working branch off your Category Branch:
  ```bash
  git checkout -b <your-name>/<short-feature-name>
  ```
  When finished, open a Pull Request **into your Category Branch** (e.g., `mahi/rate-limiter` → `server`) — **never into `main`**.

### Step 3: Follow Commit Message Standards
All commits must use **Conventional Commit** prefixes indicating the type and scope of the change:
* `feat(server): add rate limiting guard to /api/v1/wisp/query`
* `feat(ai-engine): implement episode recap prompt builder and parser`
* `feat(client): add D-pad focus lock inside WispOverlayDrawer`
* `fix(temporal): prevent boundary leak when playbackPositionMs equals 0`
* `test(e2e): add adversarial future-timestamp spoiler regression test`
* `docs(friction): log FL-004 Fire TV remote back button keycode behavior`

### Step 4: Run Automated Verification Locally
Before pushing or opening any Pull Request, run the verification suite from the repository root:
```bash
# Run all 12 automated test suites across AI, Backend, Frontend, DB, Edge & E2E
npm test
```
All tests must pass with **0 failures** before requesting review.

### Step 5: Open a Category-to-`main` Pull Request
Once your Category Branch is tested and ready for integration into `main`:
1. Push your Category Branch (`git push origin <your-category-branch>`).
2. Open a Pull Request on GitHub with:
   * **Base branch:** `main`
   * **Compare branch:** `server` | `ai-integration` | `client` | `testing` | `docs`
3. Fill out the entire Pull Request template ([`.github/PULL_REQUEST_TEMPLATE.md`](./.github/PULL_REQUEST_TEMPLATE.md)), including:
   * Linked GitHub Issue (`Closes #12`)
   * Spoiler-Safety Verification checklist
   * Fire TV 10-Foot UX checklist (if applicable)
   * Friction Log confirmation
4. Obtain sign-off from **QA & Testing** (`testing` branch owner) and ensure GitHub Actions CI ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) is green before merging.

---

## 5. Non-Negotiable Technical & Security Rules

Every Pull Request is audited against these core project invariants (defined in [`AGENTS.md`](./AGENTS.md)):

1. **No Fake AI / No Hardcoded Outputs:** Never hardcode demo answers in the UI or backend. Every user-facing AI action must traverse `Fire TV UI → Edge/NestJS API → @wisp/ai-engine (Temporal Filter + Real Provider) → TV Card`.
2. **Deterministic Spoiler Safety:** Never pass transcript lines, scene summaries, or character twists with `end_time_ms > playbackPositionMs` or `reveal_time_ms > playbackPositionMs` to an LLM prompt.
3. **Zero-Typing 10-Foot UX First:** Never make on-screen keyboard text input the primary user flow on Fire TV. Every screen and AI response card must provide D-pad selectable `QuickActionChip` items.
4. **Server-Side Credentials Only:** Never commit `.env` files, and never place `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` inside `frontend/`.
5. **Log Developer Friction Immediately:** Every platform, SDK, focus, or API quirk encountered during development must be reported via a `[FRICTION]` Issue and logged in [`docs/FRICTION_LOG.md`](./docs/FRICTION_LOG.md).

---

## 6. Quick Reference Summary

| Action | Allowed? | Required Path |
| :--- | :-: | :--- |
| PR from `server`, `ai-integration`, `client`, `testing`, or `docs` → `main` | **YES** | Must link an Issue, pass `npm test` CI, and pass the 7-Step Quality Gate. |
| PR from an individual branch (`name/feat`, `feature/*`, `fix/*`) → `main` | **NO** | **Rejected immediately.** Merge into your Category Branch first, then PR from the Category Branch to `main`. |
| PR from an external fork or another repository → `main` | **NO** | **Rejected immediately.** Only the 5 internal Category Branches may merge into `main`. |
| Merging a PR into `main` without a linked GitHub Issue | **NO** | Every PR must reference an Issue (`Closes #ID`). |
| Deleting another category's folders on your branch | **NO** | All branches must preserve the full monorepo directory structure. |
| Committing `.env` secrets or API keys into the repository | **NO** | Use `.env.example` templates; keep all live keys in local untracked `.env` files. |
