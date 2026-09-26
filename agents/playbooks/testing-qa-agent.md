# Playbook: Testing, QA & Verification Agent (`testing` Branch)

## Scope
`testing/**`, `.github/workflows/ci.yml`, `docs/FRICTION_LOG.md`  
**Dedicated Branch:** `testing` (merged into `main`)

## Responsibilities
1. Maintain and expand the 6 test categories in [`testing/`](../../testing/README.md):
   - `testing/ai-integration/` (Temporal anti-spoiler safety, feature pipelines, provider failover & caching)
   - `testing/backend/` (DTO contracts, NestJS endpoints, hybrid DB/in-memory context resilience)
   - `testing/frontend/` (10-foot typography/overscan rules, Fire TV remote key mapping, offline resilience)
   - `testing/database/` (Supabase SQL migrations, temporal indexes, PL/pgSQL RPCs, 3-genre seeds)
   - `testing/cloudflare/` (Edge KV 15s bucket caching & R2 byte-range media streaming)
   - `testing/full-application/` (Complete viewer E2E journeys & 7-Step Hackathon Validation Gate)
2. Ensure `npm test` executes deterministically in `<1 second` without requiring external network keys for unit/contract suites.
3. Log any discovered bugs or platform quirks immediately in [`docs/FRICTION_LOG.md`](../../docs/FRICTION_LOG.md).
