# Branch Guide: `testing` (QA, Multi-Layer Verification & Pre-Release Staging Branch)

## 1. Branch Goal
The **`testing`** branch serves two core roles in Wisp's development workflow:
1. **Dedicated QA & Test Authoring Workstream:** Developing and expanding automated tests inside [`testing/`](../../testing/README.md) across `ai-integration`, `backend`, `frontend`, `database`, `cloudflare`, and `full-application` E2E suites.
2. **Pre-`main` Staging & Integration Gate:** Merging feature updates from `ai-integration`, `server`, and `client` to verify full end-to-end compatibility and the **7-Step Working-Feature Validation Gate** before promoting to `main`.

---

## 2. Primary Ownership Scope
- **`testing/`** — All 6 test categories (`ai-integration/`, `backend/`, `frontend/`, `database/`, `cloudflare/`, `full-application/`) and `testing/helpers/`.
- **`.github/workflows/ci.yml`** — Continuous integration test runner configuration.
- **`agents/playbooks/testing-qa-agent.md`** — QA & Verification Agent playbook.

---

## 3. Active Tasks & Roadmap for `testing`
- [x] Create root `testing/` workspace with 12 test suites (28 automated tests across all 6 layers).
- [x] Verify deterministic temporal anti-spoiler boundaries (`00:35` vs `02:02` vs `02:05`).
- [x] Verify multi-provider AI failover and 15-second timestamp bucket caching.
- [x] Automate the 7-Step Hackathon Validation Gate and credential-leak checks.
- [ ] Add live HTTP contract tests hitting a running NestJS + Cloudflare Worker instance.
- [ ] Add latency regression benchmarks for Stage-1 Instant Context (`<100ms`) and Stage-2 AI Cards (`<1500ms`).
- [ ] Add Fire OS / Android TV emulator ADB smoke-test script for remote keycode injection (`KEYCODE_MENU`, `KEYCODE_DPAD_CENTER`, `KEYCODE_BACK`).

---

## 4. Verification Commands (`testing`)
```bash
# Run all 12 test suites across all 6 categories
npm test

# Run individual domain test suites
npm run test:ai
npm run test:backend
npm run test:frontend
npm run test:database
npm run test:cloudflare
npm run test:e2e
```
