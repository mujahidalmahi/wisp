# Playbook: Backend & Edge Gateway Agent (`server` Branch)

## Scope
`backend/src/**`, `database/**`, `cloudflare/src/**`  
**Dedicated Branch:** `server` (merged into `main`)

## Responsibilities
1. Maintain the NestJS HTTP boundary (`ContextController`, `AiGatewayController`, `HealthController`) and DTO validation (`wisp-query.dto.ts`).
2. Wire Supabase PostgreSQL (`get_spoiler_safe_context` RPC) into `@wisp/ai-engine`'s `HybridContextSource` inside `ContextService`.
3. Delegate AI feature execution (`POST /api/v1/wisp/query` and `GET /api/v1/wisp/features`) to `WispAiEngine` from `@wisp/ai-engine`.
4. Keep Cloudflare Worker KV 15-second bucket caching and R2 media streaming synchronized with NestJS endpoints.
