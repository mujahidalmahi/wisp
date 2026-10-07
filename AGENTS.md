# AGENTS.md — Wisp Coding & Architectural Invariants

This repository builds **Wisp** (*AI-Powered Contextual Viewing for Amazon Fire TV*). All AI agents, subagents, and contributors operating in this workspace MUST follow these core invariants:

## 1. Non-Negotiable Product & Engineering Rules
1. **No Fake AI / No Hardcoded Answers:** Every user-facing AI action must traverse the real execution path:
   `Fire TV UI -> Cloudflare Edge / NestJS API -> @wisp/ai-engine (Temporal Context + Real AI Provider) -> 10-Foot TV Card`.
2. **Modular AI Independence (`@wisp/ai-engine`):** All AI features, prompt builders, provider adapters, and pure-TS anti-spoiler temporal filters live in [`ai-engine/`](./ai-engine/README.md) so AI features can be developed and tested standalone without requiring the NestJS backend or Supabase database to be online.
3. **Deterministic Spoiler Safety:** Never pass transcript lines, scene summaries, or character twists with `end_time_ms > playbackPositionMs` or `reveal_time_ms > playbackPositionMs` into an LLM prompt.
4. **Zero-Typing 10-Foot First UX:** Never make on-screen keyboard text entry the primary flow. Every scene and AI response card must provide 2–4 D-pad selectable `QuickActionChip` items.
5. **Server-Side Credentials Only:** Never place `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` inside `frontend/`.
6. **Log Developer Friction Immediately:** Whenever a build, SDK, focus, or API quirk occurs, append an entry to [`docs/FRICTION_LOG.md`](./docs/FRICTION_LOG.md).
7. **No Git Operations Without Explicit User Permission:** NEVER execute `git add`, `git commit`, `git push`, `git pull`, `git checkout`, `git branch`, `git merge`, `git reset`, or any other state-changing Git command unless the user explicitly instructs you to run that Git operation in their current prompt.
8. **Mandatory Pre-Commit Security Verification:** Always execute `npm run security:test` (and `npm run security:audit` before significant changes/releases) to ensure zero spoiler leaks, no secret leakage, and strict adherence to API and prompt boundaries before any commit is finalized.

## 2. Specialized Agent Playbooks & Branch Mapping
- **Modular AI Integration Agent (`ai-integration` branch):** [`agents/playbooks/ai-engine-agent.md`](./agents/playbooks/ai-engine-agent.md)
- **Fire TV 10-Foot UI Agent (`client` branch):** [`agents/playbooks/fire-tv-ui-agent.md`](./agents/playbooks/fire-tv-ui-agent.md)
- **Backend & AI Gateway Agent (`server` branch):** [`agents/playbooks/backend-ai-gateway-agent.md`](./agents/playbooks/backend-ai-gateway-agent.md)
- **Testing, QA & Verification Agent (`testing` branch):** [`agents/playbooks/testing-qa-agent.md`](./agents/playbooks/testing-qa-agent.md)
- **Content & Temporal Graph Curation Agent (`server` / `ai-integration`):** [`agents/playbooks/content-curation-agent.md`](./agents/playbooks/content-curation-agent.md)
- **Runtime Prompt Specifications (`docs` / `ai-integration`):** [`agents/prompts/`](./agents/prompts/)
