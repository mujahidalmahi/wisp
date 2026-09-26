# Branch Guide: `main` (Production Integration & Release Branch)

## 1. Branch Goal
The **`main`** branch is the canonical integration branch for **Wisp**. All workstreams (`ai-integration`, `server`, `client`, and `docs`) merge into `main` once their features pass the **7-Step Working-Feature Validation Gate**.

## 2. Core Tasks & Responsibilities on `main`
- [x] Establish full monorepo structure (`frontend/`, `backend/`, `database/`, `cloudflare/`, `ai-engine/`, `docs/`, `agents/`).
- [x] Configure basic CI validation workflow (`.github/workflows/ci.yml`).
- [ ] Review and merge verified PRs from `ai-integration`, `server`, `client`, and `docs`.
- [ ] Validate end-to-end Fire TV APK -> Cloudflare Edge -> NestJS -> `@wisp/ai-engine` -> Supabase flow on Fire OS emulator/device.
- [ ] Tag release and record the `<3 minute` public hackathon submission demo video.

## 3. Verification Commands before Merging to `main`
```bash
node --test ai-engine/src/engine.test.ts
npm run ai:playground
npm run typecheck
```
