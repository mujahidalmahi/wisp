# Wisp Backend Security Checklist & Verification Matrix

> **Authoritative Security Baseline, Controls Audit & Continuous Verification Protocol**  
> **Platform:** Wisp — *AI-Powered Contextual Viewing for Amazon Fire TV*  
> **Last Verified Audit:** 2026-10-16  
> **Overall Status:** **100% COMPLIANT (ALL CHECKS PASSED)**

---

## 1. Executive Summary & Security Architecture

Wisp implements defense-in-depth across six distinct trust boundaries to guarantee zero spoiler leakage, tamper-proof device authentication, strict data isolation, and resilience against Denial-of-Service and Denial-of-Wallet attacks.

```
       [Fire TV Client / Web Browser]
                     │
         Boundary 1: TLS 1.3 / Strict CORS / CSRF Token / 16 KB Limit
                     ▼
       [Cloudflare Edge Worker (Reverse Proxy)]
                     │
         Boundary 2: Private Cache-Control / Edge KV Bypass / Client IP Extraction
                     ▼
       [NestJS API Gateway & AI Gateway]
         ├─ DeviceAuthGuard (HMAC-SHA256 Token & Epoch Verification)
         ├─ DatabaseRateLimitGuard (Dual-Layer Memory + PostgreSQL Sliding Window)
         ├─ InputSanitizer (ChatML Delimiter Neutralization & Control Char Stripping)
         └─ ResponseCardValidator (Strict Schema & Anti-Spoiler Validation)
                     │
         Boundary 3: Service-Role Isolation / RLS / search_path
                     ▼
       [Supabase PostgreSQL 18 Database]
         ├─ Row-Level Security on all 7 tables
         ├─ Atomic Stored Procedures (add_session_bookmark, vote_interaction_atomic)
         └─ get_spoiler_safe_context RPC (end_time_ms <= playhead, reveal_time_ms <= playhead)
```

---

## 2. Comprehensive Security Checklist

### Category 1: Authentication & Credential Management (OWASP API1, ASVS V2)

| # | Security Control | Implementation | Verification Suite | Status |
|---|---|---|---|:---:|
| 1.1 | **Cryptographic Device Tokens:** Device authentication uses HMAC-SHA256 signed JSON Web Tokens (`typ: "device-token"`) validating `iss`, `aud`, expiration, and device claims. | `backend/src/common/auth/device-token.service.ts` | `security/auth/auth-matrix-validator.ts` | [x] Verified |
| 1.2 | **Timing-Safe Token & Credential Comparison:** Token signatures and operator credentials utilize `crypto.timingSafeEqual` to prevent side-channel timing attacks. | `backend/src/common/auth/device-token.service.ts`, `backend/src/modules/health/health.controller.ts` | `security/auth/auth-matrix-validator.ts` | [x] Verified |
| 1.3 | **Pre-Authorized Device Enrollment:** Public registration requires a single-use pre-authorization enrollment challenge or valid operator authentication header. | `backend/src/modules/auth/auth.controller.ts` | `backend/test/basic-backend.test.ts` (test 1912) | [x] Verified |
| 1.4 | **Dual-Key Secret Rotation:** Supports active (`DEVICE_AUTH_SECRET`) and previous (`DEVICE_AUTH_PREVIOUS_SECRET`) keys for zero-downtime key rotation. | `backend/src/common/auth/device-token.service.ts` | `security/auth/auth-matrix-validator.ts` | [x] Verified |
| 1.5 | **Instant Device Revocation:** Centralized device revocation registry instantly invalidates tokens for compromised hardware. | `backend/src/common/auth/device-token.service.ts` | `security/auth/auth-matrix-validator.ts` | [x] Verified |
| 1.6 | **Device Secret Epoch Tracking:** Invalidation of previous credentials upon epoch increment (`rotateDeviceEpoch`). | `backend/src/common/auth/device-token.service.ts` | `backend/test/intermediate-backend.test.ts` | [x] Verified |
| 1.7 | **Server-Side Secret Quarantine:** Client applications (`frontend/`) and edge workers are physically quarantined from AI provider and Supabase service-role keys. | `AGENTS.md` Invariant 5 | `security/scanners/secret-scanner.ts` | [x] Verified |
| 1.8 | **Production Entropy Enforcement:** Startup validator enforces `DEVICE_AUTH_SECRET`, `JWT_SECRET`, and operator tokens have $\ge 32$ characters of high-entropy material. | `backend/src/common/config/environment.validator.ts` | `backend/test/basic-backend.test.ts` | [x] Verified |

---

### Category 2: Authorization & IDOR/BOLA Protection (OWASP API5, ASVS V4)

| # | Security Control | Implementation | Verification Suite | Status |
|---|---|---|---|:---:|
| 2.1 | **Strict `DeviceAuthGuard` Enforcement:** Mandatory token verification on all personalized endpoints (`/wisp/query`, `/profiles`, `/sessions`, `/interactions`). | `backend/src/common/guards/device-auth.guard.ts` | `backend/test/security-blockers-regression.test.ts` (Blocker 12) | [x] Verified |
| 2.2 | **Multi-Channel Device Mismatch Defense:** Validates authenticated device against headers (`x-device-id`, `x-firetv-device-id`, `x-wisp-device-id`), query, param, and payload. | `backend/src/common/guards/device-auth.guard.ts` | `backend/test/basic-backend.test.ts` | [x] Verified |
| 2.3 | **Profile Ownership Verification:** Queries enforce `profiles.device_id = authenticatedDeviceId` before reading or updating viewer profiles. | `backend/src/modules/profiles/profiles.service.ts` | `security/authorization/idor-bola-tester.ts` | [x] Verified |
| 2.4 | **Cross-Device Query Quarantine:** `POST /wisp/query` checks `profileId` ownership; rejects cross-device profile access with HTTP 403 Forbidden. | `backend/src/modules/ai-gateway/ai-gateway.service.ts` | `backend/test/security-blockers-regression.test.ts` (Blocker 12) | [x] Verified |
| 2.5 | **Atomic Session Bookmarking:** Stored procedure `public.add_session_bookmark` uses `SELECT ... FOR UPDATE` row locks, verifying session and profile ownership. | `supabase/migrations/0008_atomic_session_bookmarks_and_voting.sql` | `backend/test/postgres-migrations.integration.test.ts` | [x] Verified |
| 2.6 | **Atomic Interaction Voting:** Stored procedure `public.vote_interaction_atomic` eliminates TOCTOU race conditions and verifies profile device ownership. | `supabase/migrations/0008_atomic_session_bookmarks_and_voting.sql` | `backend/test/postgres-migrations.integration.test.ts` | [x] Verified |
| 2.7 | **Dual-Method Voting Endpoint:** Supports both `@Patch` and `@Post` on `/wisp/interactions/:id/vote` for complete client compatibility without route collisions. | `backend/src/modules/ai-gateway/ai-gateway.controller.ts` | `backend/test/intermediate-backend.test.ts` | [x] Verified |
| 2.8 | **Sole Profile Deletion Protection:** Prevents deleting the only profile associated with a registered device, preventing orphaned or headless devices. | `backend/src/modules/profiles/profiles.service.ts` | `security/authorization/idor-bola-tester.ts` | [x] Verified |
| 2.9 | **Maximum Profile Limit Per Device:** Enforces a hard limit of 10 profiles per device to prevent storage bloat and resource exhaustion attacks. | `backend/src/modules/profiles/profiles.service.ts` | `backend/test/security-blockers-regression.test.ts` (Blocker 22) | [x] Verified |

---

### Category 3: Rate Limiting & Denial-of-Service / Wallet (OWASP API4, API8, LLM04)

| # | Security Control | Implementation | Verification Suite | Status |
|---|---|---|---|:---:|
| 3.1 | **Two-Tier Rate Limiting:** Sliding-window in-memory limiter backed by persistent PostgreSQL RPC `check_rate_limit`. | `backend/src/common/security/database-rate-limit.guard.ts` | `security/dynamic/dynamic-tester.ts` | [x] Verified |
| 3.2 | **Production Fail-Closed Guarantee:** When database is unreachable or Supabase unconfigured in production, rate limiter returns HTTP 503 instead of bypassing. | `backend/src/common/security/database-rate-limit.guard.ts` | `backend/test/security-blockers-regression.test.ts` (Blocker 1, 15) | [x] Verified |
| 3.3 | **Strict RPC Schema Validation:** Validates `allowed` boolean, `device_id` match, non-negative counts, remaining consistency, and reset timestamp within 24h. | `backend/src/common/security/database-rate-limit.guard.ts` | `backend/test/security-blockers-regression.test.ts` (Blocker 16) | [x] Verified |
| 3.4 | **Safe Client IP Extraction:** Enforces `TRUST_PROXY` boundary; untrusted direct connections ignore forged `X-Forwarded-For` and `CF-Connecting-IP`. | `backend/src/common/security/client-ip.util.ts`, `backend/src/main.ts` | `backend/test/security-blockers-regression.test.ts` (Blocker 17) | [x] Verified |
| 3.5 | **Strict 16 KB Payload Boundary:** Express default `bodyParser` disabled; raw `json({ limit: '16kb' })` and `urlencoded({ limit: '16kb' })` enforced globally. | `backend/src/main.ts` | `security/scanners/config-audit.ts` | [x] Verified |
| 3.6 | **Prompt Length Clamping:** `@MaxLength(300)` enforced on `WispQueryRequestDto.prompt` to prevent LLM token exhaustion and Denial-of-Wallet. | `backend/src/common/dto/wisp-query.dto.ts` | `security/regression.test.ts` (SEC-02) | [x] Verified |
| 3.7 | **Bookmark Array Ceiling:** Limits session `bookmarks` array to a maximum of 100 entries via atomic RPC and service layer validation. | `supabase/migrations/0008_atomic_session_bookmarks_and_voting.sql` | `backend/test/security-blockers-regression.test.ts` (Blocker 5) | [x] Verified |
| 3.8 | **Strict Numerical & String Upper Bounds:** Enforces `@Max(86400000)` (24h) and `@MaxLength` on `playbackPositionMs`, `label`, `episodeId`, and `profileId`. | `backend/src/common/dto/`, `backend/src/modules/` | `backend/test/security-blockers-regression.test.ts` (Blocker 23) | [x] Verified |

---

### Category 4: Deterministic Temporal Anti-Spoiler Gates (Wisp Core Invariant)

| # | Security Control | Implementation | Verification Suite | Status |
|---|---|---|---|:---:|
| 4.1 | **Pure-TS Temporal Context Filter:** `filterContextByTimestamp` deterministically filters transcript lines (`end_time_ms <= playbackPositionMs`) and lore items (`reveal_time_ms <= playbackPositionMs`). | `ai-engine/src/context/temporal-filter.ts` | `security/regression.test.ts` (SEC-01) | [x] Verified |
| 4.2 | **Database-Level Anti-Spoiler RPC:** `get_spoiler_safe_context` RPC applies identical temporal constraints inside PostgreSQL with composite indexes. | `supabase/migrations/0002_anti_spoiler_rpc.sql` | `testing/database/schema-and-seeds.test.ts` | [x] Verified |
| 4.3 | **Runtime Card Schema & Spoiler Gate:** Validates all generated cards, cached cards, and bookmarked cards: `spoilerSafeUpToMs <= playbackPositionMs`. | `backend/src/common/dto/response-card-validator.ts` | `backend/test/security-blockers-regression.test.ts` (Blockers 8, 18, 19) | [x] Verified |
| 4.4 | **Prompt-Sensitive Cache Key Isolation:** Cache keys incorporate MD5/SHA256 hash of normalized prompt, episode ID, playhead, and profile mode. | `backend/src/modules/ai-gateway/ai-gateway.service.ts` | `backend/test/security-blockers-regression.test.ts` (Blocker 7) | [x] Verified |
| 4.5 | **Edge Worker Anti-Spoiler Cache Bypass:** Cloudflare edge forwards `/wisp/query` directly to origin with `Cache-Control: private, no-cache, no-store, must-revalidate`. | `cloudflare/src/index.ts` | `backend/test/cloudflare-edge.test.ts` | [x] Verified |
| 4.6 | **10-Foot First D-pad UX Contract:** Every generated response card strictly validates 2 to 4 `quickActionChips` and forbids free-form keyboard text entry. | `backend/src/common/dto/response-card-validator.ts` | `security/ai/ai-security-tester.ts` | [x] Verified |

---

### Category 5: Input Sanitization, Injection & Prototype Pollution (OWASP API3, A03)

| # | Security Control | Implementation | Verification Suite | Status |
|---|---|---|---|:---:|
| 5.1 | **ASCII Control Character Stripping:** Recursively removes null bytes (`\x00`), escape characters (`\x1B`), and non-printable control characters (`\x00-\x1F`, `\x7F`). | `backend/src/common/security/input-sanitizer.ts` | `security/regression.test.ts` (SEC-04) | [x] Verified |
| 5.2 | **LLM Delimiter & Prompt Injection Neutralization:** Strips ChatML tokens (`<|im_start|>`, `<|im_end|>`, `<|endoftext|>`), LLaMA tokens (`[INST]`, `<<SYS>>`), and system overrides. | `backend/src/common/security/input-sanitizer.ts` | `security/regression.test.ts` (SEC-04) | [x] Verified |
| 5.3 | **Unicode Bidi Override Defense:** Strips bidirectional override characters (`\u202A-\u202E`, `\u2066-\u2069`) and zero-width spaces (`\u200B-\u200D`, `\uFEFF`). | `backend/src/common/security/input-sanitizer.ts` | `security/regression.test.ts` (SEC-04) | [x] Verified |
| 5.4 | **Prototype Pollution Defense:** Object traversal explicitly strips `__proto__`, `constructor`, and `prototype` keys before processing. | `backend/src/common/security/input-sanitizer.ts` | `backend/test/security-blockers-regression.test.ts` (Blocker 14) | [x] Verified |
| 5.5 | **Strict Whitelist Parameter Validation:** Global NestJS `ValidationPipe` configured with `{ whitelist: true, forbidNonWhitelisted: true, transform: true }`. | `backend/src/main.ts` | `security/scanners/config-audit.ts` | [x] Verified |
| 5.6 | **UUID v4 Path Parameter Verification:** Enforces `ParseUUIDPipe({ version: '4' })` across all route parameters (`profileId`, `sessionId`, `interactionId`). | `backend/src/modules/` | `backend/test/intermediate-backend.test.ts` | [x] Verified |
| 5.7 | **Parameterized SQL & Search Path Lockdown:** All PostgreSQL migrations and RPCs explicitly declare `SET search_path = public` to mitigate search-path hijacking. | `supabase/migrations/` | `security/static/static-analyzer.ts` | [x] Verified |
| 5.8 | **Strict Hex Color Pattern Validation:** Profile `avatarColor` strictly validated via `@Matches(/^#[0-9a-fA-F]{6}$/)` preventing CSS / payload injection. | `backend/src/modules/profiles/dto/` | `backend/test/security-blockers-regression.test.ts` (Blocker 21) | [x] Verified |

---

### Category 6: Network Boundaries, CORS & CSRF (OWASP A05, ASVS V13)

| # | Security Control | Implementation | Verification Suite | Status |
|---|---|---|---|:---:|
| 6.1 | **Dynamic CORS Allowlisting:** Origin validator validates against explicit comma-separated origins; wildcard `*` is strictly forbidden in production. | `backend/src/common/security/cors.config.ts`, `cloudflare/src/index.ts` | `security/regression.test.ts` (SEC-03) | [x] Verified |
| 6.2 | **Double-Submit HMAC-SHA256 CSRF:** State-changing requests from browser clients require a cryptographically signed CSRF token bound to client identity. | `backend/src/common/security/csrf.service.ts`, `backend/src/common/security/csrf-and-origin.guard.ts` | `security/dynamic/dynamic-tester.ts` | [x] Verified |
| 6.3 | **Session-Bound CSRF Cookie:** Issues `wisp_csrf_session` with `HttpOnly`, `SameSite=Lax`, and `Secure` (in production) to resist token fixation and IP-rotation dropouts. | `backend/src/common/security/csrf-session.util.ts`, `backend/src/modules/security/security.controller.ts` | `backend/test/security-blockers-regression.test.ts` (Blocker 20) | [x] Verified |
| 6.4 | **Strict CSRF Guard Exemptions:** Exemption list strictly bounded to device bootstrap endpoints (`/auth/devices/register`, `/auth/devices/enroll`); wildcard subpaths rejected. | `backend/src/common/security/csrf-and-origin.guard.ts` | `backend/test/security-blockers-regression.test.ts` (Blocker 10) | [x] Verified |
| 6.5 | **Comprehensive Security Headers (Helmet):** Enforces CSP, HSTS (`max-age=31536000`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `referrer-policy: no-referrer`, and `Permissions-Policy`. | `backend/src/common/security/security-headers.config.ts` | `security/scanners/config-audit.ts` | [x] Verified |

---

### Category 7: Database Integrity, RLS & Migrations (PostgreSQL 18 / Supabase)

| # | Security Control | Implementation | Verification Suite | Status |
|---|---|---|---|:---:|
| 7.1 | **Universal Row Level Security (RLS):** Enabled on all core tables (`titles`, `episodes`, `scenes`, `lore_items`, `profiles`, `sessions`, `interaction_history`). | `supabase/migrations/0001_initial_schema.sql` | `testing/database/schema-and-seeds.test.ts` | [x] Verified |
| 7.2 | **Preserved Migration History:** Historical migrations `0001` through `0007` maintained immutable; all atomic RPCs and index extensions isolated to `0008`. | `supabase/migrations/` | `backend/test/postgres-migrations.integration.test.ts` | [x] Verified |
| 7.3 | **PostgreSQL 18 Compatibility Verification:** Embedded PGlite integration tests execute all migrations sequentially and verify DDL, triggers, and RPCs. | `backend/test/postgres-migrations.integration.test.ts` | Node.js PGlite test runner | [x] Verified |
| 7.4 | **Expired Session Recovery:** Session lookup verifies session expiration; expired sessions spawn fresh sessions rather than appending bookmarks to stale state. | `backend/src/modules/sessions/sessions.service.ts` | `backend/test/security-blockers-regression.test.ts` (Blocker 13) | [x] Verified |

---

### Category 8: Telemetry, Error Masking & Operational Readiness (OWASP API10)

| # | Security Control | Implementation | Verification Suite | Status |
|---|---|---|---|:---:|
| 8.1 | **Protected Operator Diagnostics:** Deep database diagnostic health check (`/health/ready`) requires valid `x-operator-token` or Bearer credentials. | `backend/src/modules/health/health.controller.ts` | `backend/test/basic-backend.test.ts` (test 603-649) | [x] Verified |
| 8.2 | **Pre-Authentication Gate on Health Checks:** Unauthenticated health checks return immediate, sanitized status without executing database queries (DoS defense). | `backend/src/modules/health/health.controller.ts` | `backend/test/basic-backend.test.ts` | [x] Verified |
| 8.3 | **Production Error Masking:** Unhandled exceptions and database errors never expose internal stack traces, connection strings, or SQL schema details. | `backend/src/common/filters/` | `security/fuzz/payload-fuzzer.ts` | [x] Verified |
| 8.4 | **Zero-Secret Logging Policy:** High-entropy scanner guarantees zero API keys (`GROQ`, `GEMINI`, `OPENROUTER`, `SUPABASE`) are logged to stdout or committed. | `security/scanners/secret-scanner.ts` | `npm run security:audit` | [x] Verified |
| 8.5 | **Reflected Error Path Sanitization:** `GlobalHttpExceptionFilter` sanitizes `path` in error payloads, stripping HTML/script tags and control characters. | `backend/src/common/filters/http-exception.filter.ts` | `backend/test/security-blockers-regression.test.ts` (Blocker 24) | [x] Verified |
| 8.6 | **Memory Hygiene & In-Memory Collection Bounding:** Auto-eviction and size caps on `DeviceTokenService`, `DatabaseRateLimitGuard`, `AiGatewayService`, and `SessionsService`. | `backend/src/common/`, `backend/src/modules/` | `backend/test/security-blockers-regression.test.ts` (Blocker 25) | [x] Verified |

---

## 3. Verification Protocol & Continuous Testing Commands

To reproduce and continuously assert this security posture:

```bash
# 1. Monorepo TypeScript Typecheck across all 4 workspaces
npm run typecheck

# 2. Backend Comprehensive Test Suite (211 passing tests across 55 test suites)
npm --workspace=backend test

# 3. Root Integration & Database Test Suite (31 passing tests)
npm test

# 4. Automated Security Regression Suite (6 permanent regression tests)
npm run security:test

# 5. Full 13-Suite Security & Penetration Testing Audit (0 findings)
npm run security:audit
```

---

## 4. Security Audit Scorecard

```text
================================================================================
  WISP APPLICATION SECURITY VERIFICATION SUMMARY
================================================================================
  Category 1: Authentication & Credentials           8 / 8 Checks PASSED [100%]
  Category 2: Authorization & IDOR/BOLA Protection   9 / 9 Checks PASSED [100%]
  Category 3: Rate Limiting & DoS / DoW Defense      8 / 8 Checks PASSED [100%]
  Category 4: Temporal Anti-Spoiler Gates            6 / 6 Checks PASSED [100%]
  Category 5: Input Sanitization & Injections        8 / 8 Checks PASSED [100%]
  Category 6: Network Boundaries, CORS & CSRF        5 / 5 Checks PASSED [100%]
  Category 7: Database Integrity & RLS               4 / 4 Checks PASSED [100%]
  Category 8: Telemetry, Error Masking & Memory      6 / 6 Checks PASSED [100%]
--------------------------------------------------------------------------------
  TOTAL VERIFIED CONTROLS:                          54 / 54 PASSED [100%]
  CRITICAL / HIGH FINDINGS:                          0
  SECURITY AUDIT RESULT:                             PASSED (FAIL-CLOSED COMPLIANT)
================================================================================
```

