# Branch Guide: `main` — Production Integration & Release Branch

- **Role Category:** **All Category Owners (Coordinated Release Unit)**
- **Merging Branches:** `server`, `ai-integration`, `client`, `testing`, `docs`
- **Governing Specification:** [**`CONTRIBUTING.md`**](../../CONTRIBUTING.md)

---

## 1. Branch Mandate
The **`main`** branch is the authoritative production integration branch for **Wisp**. All five functional role categories merge verified work into `main` only after satisfying the **7-Step Working-Feature Quality Gate** and the **9-Point Definition of Completion** verified by **QA & Testing** (`testing` branch).

---

## 2. Definition of Completion Gate for `main` (Section 12)
A major feature may be merged and marked complete on `main` only when:
- [x] Implemented in the actual project stack (`React Native + NestJS + Supabase + @wisp/ai-engine`).
- [x] Required frontend, backend, database, and AI components are integrated.
- [x] Follows the real application path with zero hardcoded behavior presented as AI capability.
- [x] Relevant success and failure states are handled gracefully.
- [x] Security and server-side credential isolation considerations have been reviewed.
- [x] **QA & Testing** has executed the relevant workflow (`npm test`) and verified critical fixes.
- [x] Final behavior is documented in `docs/`.
- [x] Demonstrable on the target Fire TV environment or validated simulator.
- [x] Known limitations and developer friction are recorded in [`docs/FRICTION_LOG.md`](../FRICTION_LOG.md) rather than concealed.

---

## 3. Pre-Merge Verification Commands
```bash
npm test
npm run ai:playground
npm run typecheck
```
