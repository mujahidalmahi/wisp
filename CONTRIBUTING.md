# Contributing to Wisp

Wisp is built for the **Amazon Developer Hackathon 2026 (Fire TV Track)** under one strict engineering rule:

> **No feature is presented as complete until it works end-to-end.**
> `Fire TV UI -> Cloudflare Edge / NestJS API -> Spoiler-Safe Supabase Context -> Real AI Provider -> Validated Response -> 10-foot TV Overlay`

## Working-Feature Validation Gate

Every pull request that introduces or modifies a user-facing feature must pass all 7 steps before merge:

1. **Invokable on Fire TV**: Triggerable via D-pad / Fire TV remote without touch/mouse assumptions.
2. **Reaches Real Backend**: Request hits the NestJS API (directly or via Cloudflare Edge).
3. **Real Application Context**: Backend queries Supabase with strict temporal filtering (`end_time_ms <= current_playback_ms`).
4. **Real AI Provider**: Routed through Groq, Gemini, OpenRouter, or local Ollama fallback—never hardcoded strings.
5. **Result Consumed by Client**: Structured JSON response is parsed and state-managed by the React Native client.
6. **Visible on 10-Foot UI**: High-contrast, distance-readable card rendered with clear D-pad focus return.
7. **Graceful Failure Handling**: Rate limits, network timeouts, or missing context degrade cleanly without faking success.

## Logging Developer Friction (Hackathon 10% Bonus)

Whenever you encounter a bug, unexpected SDK quirk, emulator issue, or documentation gap across Fire OS, React Native TV, NestJS, Supabase, Cloudflare, or AI providers, immediately log an entry in [`docs/FRICTION_LOG.md`](./docs/FRICTION_LOG.md) with:
- Expected vs. Actual Behavior
- Severity (`Blocker` | `High` | `Medium` | `Low`)
- Workaround implemented
- Actionable suggestion for the platform/tool vendor
