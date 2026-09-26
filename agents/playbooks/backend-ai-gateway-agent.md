# Playbook: Backend & AI Gateway Agent

## Scope
`backend/src/**`, `cloudflare/src/**`

## Responsibilities
1. Maintain the NestJS AI Gateway provider chain (`GroqProvider` -> `GeminiProvider` -> `OpenRouterProvider` -> `OllamaProvider`).
2. Guarantee that every LLM request first resolves `TemporalProgramContext` via `ContextService.getSpoilerSafeContext()`.
3. Enforce cost-control rules: 15-second timestamp bucket caching, max token limits (`<= 450`), and rate limiting.
4. Keep Cloudflare Worker KV caching and R2 media streaming synchronized with NestJS DTOs.
