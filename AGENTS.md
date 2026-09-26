# AGENTS.md — Wisp Coding & Architectural Invariants

This repository builds **Wisp** (*AI-Powered Contextual Viewing for Amazon Fire TV*). All AI agents, subagents, and contributors operating in this workspace MUST follow these core invariants:

## 1. Non-Negotiable Product & Engineering Rules
1. **No Fake AI / No Hardcoded Answers:** Every user-facing AI action must traverse the full path:
   `Fire TV UI -> Cloudflare Edge / NestJS API -> Supabase Temporal Context -> Real AI Provider -> 10-Foot TV Card`.
2. **Deterministic Spoiler Safety:** Never pass transcript lines, scene summaries, or character twists with `end_time_ms > playbackPositionMs` or `reveal_time_ms > playbackPositionMs` into an LLM prompt.
3. **Zero-Typing 10-Foot First UX:** Never make on-screen keyboard text entry the primary flow. Every scene and AI response card must provide 2–4 D-pad selectable `QuickActionChip` items.
4. **Server-Side Credentials Only:** Never place `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` inside `frontend/`.
5. **Log Developer Friction Immediately:** Whenever a build, SDK, focus, or API quirk occurs, append an entry to [`docs/FRICTION_LOG.md`](./docs/FRICTION_LOG.md).

## 2. Specialized Agent Playbooks
- **Fire TV 10-Foot UI Agent:** [`agents/playbooks/fire-tv-ui-agent.md`](./agents/playbooks/fire-tv-ui-agent.md)
- **Backend & AI Gateway Agent:** [`agents/playbooks/backend-ai-gateway-agent.md`](./agents/playbooks/backend-ai-gateway-agent.md)
- **Content & Temporal Graph Curation Agent:** [`agents/playbooks/content-curation-agent.md`](./agents/playbooks/content-curation-agent.md)
- **Runtime Prompt Specifications:** [`agents/prompts/`](./agents/prompts/)
