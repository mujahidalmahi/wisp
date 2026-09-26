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
- **Would We Use It Again?** **Yes** — it provides the fastest path to a responsive, custom-styled 10-foot UI with shared TypeScript types across frontend and backend.

---

## 2. NestJS + TypeScript (Backend & AI Gateway)
- **Onboarding Experience:** Seamless modular architecture (`ContextModule`, `AiGatewayModule`, `SupabaseModule`).
- **Strengths:**
  - DTO validation (`class-validator`) and clean dependency injection made swapping between `Groq`, `Gemini`, `OpenRouter`, and `Ollama` effortless.
- **Limitations:**
  - Cold starts on free-tier container hosts require lightweight keep-alive or Cloudflare Worker edge caching in front.
- **Would We Use It Again?** **Yes.**

---

## 3. Supabase PostgreSQL
- **Onboarding Experience:** Instant schema provisioning and SQL RPC function authoring.
- **Strengths:**
  - Implementing `get_spoiler_safe_context()` directly as a PostgreSQL PL/pgSQL function allowed us to enforce `end_time_ms <= p_playback_ms` deterministically in a single database round-trip.
- **Would We Use It Again?** **Yes.**

---

## 4. Cloudflare Workers + KV + R2
- **Onboarding Experience:** `wrangler` CLI makes local testing and edge deployment under 60 seconds.
- **Strengths:**
  - Caching AI responses by 15-second timestamp buckets in Workers KV eliminates redundant LLM calls and delivers `<20ms` repeat card loads on Fire TV.
- **Would We Use It Again?** **Yes.**
