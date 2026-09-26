# Product & Developer Tooling Feedback

> **Required Submission Deliverable — Amazon Developer Hackathon 2026 (Fire TV Track)**

---

## 1. React Native for Fire TV (`react-native-tvos` / Fire OS Runtime)
- **Onboarding Experience:** Fast initial scaffolding for TypeScript teams familiar with React; works cleanly with standard Android/Fire OS APK packaging.
- **Strengths:**
  - Hardware remote events (`menu`, `select`, `playPause`, D-pad directions) map cleanly via `useTVEventHandler`.
  - `hasTVPreferredFocus` enables predictable focus entry points on 10-foot overlays.
- **Limitations:**
  - Modal/drawer focus trapping requires manual visibility coordination so background views do not steal D-pad focus.
- **Would We Use It Again?** **Yes** — it provides the fastest path to a responsive, custom-styled 10-foot UI with shared TypeScript types across frontend, `ai-engine`, and backend.

---

## 2. Modular AI Integration (`@wisp/ai-engine` + Node.js 24 Native TypeScript)
- **Onboarding Experience:** Zero-build TypeScript execution in Node 24 (`node ai-engine/src/cli/playground.ts`) enabled instant prompt and feature testing without spinning up backend containers.
- **Strengths:**
  - Decoupling `IContextSource`, `IAiModelAdapter`, and `IAiFeatureModule` allowed AI features and anti-spoiler temporal filters to be unit-tested in `<3ms` completely independent of the database.
- **Limitations:**
  - Node 24's strip-only TypeScript loader requires explicit `.ts` extensions, `import type`, and explicit class field declarations instead of constructor parameter properties (logged in `docs/FRICTION_LOG.md` `[FL-003]`).
- **Would We Use It Again?** **Yes.**

---

## 3. NestJS + TypeScript (Backend & AI Gateway)
- **Onboarding Experience:** Seamless modular architecture (`ContextModule`, `AiGatewayModule`, `SupabaseModule`) wrapping `@wisp/ai-engine`.
- **Strengths:**
  - DTO validation (`class-validator`) and clean dependency injection made exposing `@wisp/ai-engine` over REST effortless.
- **Limitations:**
  - Cold starts on free-tier container hosts require lightweight keep-alive or Cloudflare Worker edge caching in front.
- **Would We Use It Again?** **Yes.**

---

## 4. Supabase PostgreSQL & Cloudflare Workers
- **Onboarding Experience:** Instant schema provisioning, PL/pgSQL RPC authoring, and `<60s` edge worker setup via `wrangler`.
- **Strengths:**
  - Implementing `get_spoiler_safe_context()` in PostgreSQL paired with Cloudflare Workers KV 15-second bucket caching guarantees both spoiler safety and `<20ms` repeat card loads on Fire TV.
- **Would We Use It Again?** **Yes.**
