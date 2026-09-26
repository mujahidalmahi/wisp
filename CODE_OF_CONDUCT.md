# Code of Conduct & Repository Operational Rules — Wisp

> **Engineering Standards, Collaborative Conduct & Branching Discipline**
> **Project:** Wisp — *AI-Powered Contextual Viewing for Amazon Fire TV*

---

## 1. Our Pledge

As members and contributors of the **Wisp** engineering team competing in the **Amazon Developer Hackathon 2026 (Fire TV Track)**, we pledge to maintain a professional, respectful, accountable, and high-integrity engineering environment across all five functional role categories:

1. **Backend, Database & Security (`server`):** Ashraful Araf Sami, Mujahid Al Mahi
2. **AI Integration & AI Features (`ai-integration`):** Shajid Islam Chowdhury, Chowdhury Rifat Ahmed
3. **Frontend, UI/UX (`client`):** Kazi Rahad Ali, Shahariar Hossain Jibon
4. **QA & Testing (`testing`):** Taufiq E Elahi
5. **Research & Documentation (`docs`):** Abduallah Al Mamun

---

## 2. Mandatory Repository & Branching Conduct

Every contributor operating in this repository is bound by the operational rules detailed in [**`INSTRUCTIONS.md`**](./INSTRUCTIONS.md) and [**`CONTRIBUTING.md`**](./CONTRIBUTING.md):

### 2.1 Strict 5-Branch Pull Request Rule
* **No Direct Individual or External PRs to `main`:** Any Pull Request opened toward `main` from an **individual developer branch** (e.g., `name/feature`, `feat/*`, `fix/*`) or an **external fork/repository** will be **closed and rejected immediately without review**.
* **Two-Stage Merge Discipline:**
  1. **Stage 1 (Individual → Category Branch):** Merge and review individual work inside one of the **5 official Category Branches** (`server`, `ai-integration`, `client`, `testing`, or `docs`).
  2. **Stage 2 (Category Branch → `main`):** Only the **5 official Category Branches** may open a Pull Request into `main` after passing `npm test` and obtaining QA sign-off.

### 2.2 Proper Use of GitHub Issues
* **No Unannounced Pull Requests:** Every Pull Request must reference an active GitHub Issue (`Closes #ID`).
* **Structured Issue Categories:** All issues must follow the standardized tags defined in [`INSTRUCTIONS.md`](./INSTRUCTIONS.md#3-proper-use-cases--protocol-for-github-issues):
  * `[FEATURE][<branch>]` — Scoped capability implementation
  * `[BUG][<severity>][<branch>]` — Reproducible functional or UI defect
  * `[CONTRACT][<from> -> <to>]` — Cross-category API, DTO, AI schema, or DB RPC change
  * `[SPOILER-SAFETY]` — P0 temporal spoiler boundary leak
  * `[FRICTION][FL-00X]` — Platform/SDK quirk for [`docs/FRICTION_LOG.md`](./docs/FRICTION_LOG.md)
  * `[QA-GATE][<branch> -> main]` — Release verification handover

### 2.3 Engineering Integrity Standards
* **No Fake AI / No Hardcoded Demo Strings:** Every user-facing AI capability must execute end-to-end through a real AI provider (`Groq`, `Gemini`, `OpenRouter`, or local `Ollama`) grounded in real program context.
* **Respect File Ownership Boundaries:** Do not modify or delete another category's directories without prior cross-category coordination and a `[CONTRACT]` Issue.
* **Transparent Friction Logging:** Never conceal platform bugs, focus traps, or SDK quirks—document them honestly in [`docs/FRICTION_LOG.md`](./docs/FRICTION_LOG.md).

---

## 3. Collaborative Behavior Standards

### Expected Behavior
* Communicate API, database, or AI schema changes **before** merging breaking modifications.
* Provide constructive, timely, and technical code reviews on Category Branch and `main` Pull Requests.
* Respect **QA & Testing** authority (`testing` branch) when a feature is returned for failing the **7-Step Quality Gate**.
* Write clear commit messages (`feat(scope):`, `fix(scope):`, `test(scope):`, `docs(scope):`) and reproducible bug reports.

### Unacceptable Behavior
* Opening Pull Requests directly to `main` from personal branches or external forks.
* Force-pushing (`git push --force`) over teammates' commits on shared Category Branches without explicit team coordination.
* Committing API keys, `.env` files, or secrets into any branch.
* Bypassing automated tests (`npm test`) or temporal anti-spoiler checks (`end_time_ms <= playbackPositionMs`).
* Harassment, dismissive communication, or uncooperative behavior during cross-category integration.

---

## 4. Enforcement & Governance

* **Category Owners** enforce code quality and scope rules on their respective Category Branches (`server`, `ai-integration`, `client`, `testing`, `docs`).
* **QA & Testing** (Taufiq E Elahi) and **Repository Maintainers** enforce the 7-Step Quality Gate and have full authority to close non-compliant Pull Requests targeting `main`.
* For full operational workflows, refer to [**`INSTRUCTIONS.md`**](./INSTRUCTIONS.md) and [**`CONTRIBUTING.md`**](./CONTRIBUTING.md).
