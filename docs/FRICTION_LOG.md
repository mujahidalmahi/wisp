# Wisp Developer Friction Log (Amazon Developer Hackathon 2026)

> **Hackathon Rule Alignment:** Qualifying friction logs detailing real tool/setup issues, expected vs. actual behavior, severity, workarounds, and actionable recommendations can contribute up to a **10% judging bonus**.

---

## Entry Template

```markdown
### [FL-XXX] Short Descriptive Title
- **Date:** YYYY-MM-DD
- **Component / SDK:** (e.g., Fire OS Emulator / react-native-tvos / Vega SDK / ADB / NestJS / Supabase)
- **Severity:** Blocker | High | Medium | Low
- **Expected Behavior:** What the documentation or standard workflow implied should happen.
- **Actual Behavior:** What actually occurred (including exact error messages or focus behavior).
- **Workaround Implemented:** How Wisp resolved or bypassed the issue to keep the end-to-end flow working.
- **Actionable Recommendation for Amazon / Maintainers:** Concrete improvement to docs, CLI, or runtime.
```

---

## Logged Friction Entries

### [FL-001] Fire TV Emulator Localhost Loopback Routing (`localhost` vs `10.0.2.2`)
- **Date:** 2026-09-26
- **Component / SDK:** Fire OS / Android TV Emulator + React Native Metro & API Networking
- **Severity:** Medium
- **Expected Behavior:** Fetching `http://localhost:3000/api/v1` from the React Native client during local development should reach the local NestJS server after `adb reverse tcp:3000 tcp:3000`, or clearly warn when ADB reverse drops on emulator restart.
- **Actual Behavior:** When the Fire TV emulator restarts or switches network interfaces, `adb reverse` bindings silently reset, causing `TypeError: Network request failed` inside the TV client without specifying that loopback port forwarding was lost.
- **Workaround Implemented:** Standardized `frontend/src/config/env.ts` to default to the Android/Fire OS host loopback alias `http://10.0.2.2:3000/api/v1` for local development and added a Cloudflare Worker edge gateway URL option for zero-ADB-dependency demos.
- **Actionable Recommendation:** Fire TV developer docs for React Native should highlight `10.0.2.2` alongside `adb reverse tcp:8081` and provide a persistent port-forward health check in the Fire TV DevTools overlay.

---

### [FL-002] D-Pad Spatial Focus Loss When Dynamic Overlay Mounts Over Video Surface
- **Date:** 2026-09-26
- **Component / SDK:** `react-native-tvos` / Fire OS Focus Engine
- **Severity:** High
- **Expected Behavior:** When the Wisp overlay drawer transitions from hidden to visible (`visible={true}`), D-pad focus should automatically move to the first Quick Action Chip inside the drawer.
- **Actual Behavior:** Without explicit focus hints, Android/Fire OS spatial navigation occasionally retains focus on the underlying video player button, requiring multiple D-pad right presses to enter the overlay.
- **Workaround Implemented:** Applied `hasTVPreferredFocus={idx === 0}` on the first `QuickActionChip` in `QuickActionChips.tsx` and hid the bottom player trigger bar (`!overlayVisible`) while the drawer is open so focus deterministically lands inside the overlay.
- **Actionable Recommendation:** Provide a declarative `<TVFocusTrap>` container primitive in Fire TV React Native libraries to scope D-pad navigation to modal/drawer layers automatically.

---

### [FL-003] Node.js Native TypeScript Execution (`--experimental-strip-types`) Requires Explicit `.ts` Extensions, `import type`, and Erasable Class Properties
- **Date:** 2026-09-26
- **Component / SDK:** Node.js v24 TypeScript Runner / `@wisp/ai-engine` Standalone CLI
- **Severity:** Low
- **Expected Behavior:** Running `node ai-engine/src/cli/playground.ts` on standard TypeScript classes with constructor parameter properties (`constructor(private readonly apiKey?: string)`) and extensionless relative imports should execute directly.
- **Actual Behavior:** Node's native TypeScript strip-only loader throws `ERR_MODULE_NOT_FOUND` on extensionless imports, fails on non-type interface imports, and throws `SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript parameter property is not supported in strip-only mode`.
- **Workaround Implemented:** Configured `ai-engine/package.json` with `"type": "module"`, enabled `"allowImportingTsExtensions": true` in `ai-engine/tsconfig.json`, replaced constructor parameter properties with explicit class field declarations, and standardized on `import type` + `.ts` import specifiers across `ai-engine/src/**`.
- **Actionable Recommendation:** Enable `"erasableSyntaxOnly": true` in shared TypeScript templates targeting Node 22/24 native execution so the IDE flags constructor parameter properties at authoring time.

---

### [FL-004] `engines: ">=20.0.0"` Advertises Node 20, But Every `npm test` Script Requires Node 24
- **Date:** 2026-10-01
- **Component / SDK:** Node.js v20.20.2 vs v24 TypeScript Runner / `ai-engine` verification loop
- **Severity:** Medium
- **Expected Behavior:** `npm test`, `npm run test:ai`, `npm run test:database`, and `npm run ai:playground` should execute on the Node version declared in root `package.json` `engines`, so a contributor who satisfies the declared engine constraint is never blocked from running the test suite.
- **Actual Behavior:** Root `package.json` declares `"engines": { "node": ">=20.0.0", "npm": ">=10.0.0" }`, but all six `test:*` scripts invoke `node --test "<glob>.test.ts"` against raw TypeScript. On the declared-minimum Node 20.20.2 every one of them dies before running a single assertion with `TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts"`. `ai-engine/package.json` declares no `engines` at all. Installing deps is not possible as a fallback because the repo ships no lockfile and no `node_modules`, so `npm ci` cannot resolve the tree.
- **Workaround Implemented:** Ran the suites through an on-demand Node 24 binary, `npx -y node@24 --test ...`, which requires no repo mutation, no dependency install, and no lockfile. For type checking, used `npx -y -p typescript@5.7.3 tsc --noEmit`; this still reports 11 pre-existing `TS2580`/`TS2307` errors because `@types/node` is absent with no `node_modules` installed, so typecheck baseline was captured by `git stash` before/after comparison rather than by expecting a clean exit.
- **Actionable Recommendation:** Set root `engines.node` to `>=24.0.0`, or declare the real floor that supports type stripping (Node 22.18+/23.6+), so `engines` matches the toolchain the scripts actually require. Adding `erasableSyntaxOnly` to `ai-engine/tsconfig.json` and committing a lockfile would additionally make `npm ci && npm run typecheck` reproducible on a clean checkout.

---

### [FL-005] `AbortController` Cannot Be Composed From `Node <20.3`, and `setTimeout` Return Type Collides Between The DOM And Node Libs
- **Date:** 2026-10-01
- **Component / SDK:** `@wisp/ai-engine` provider router / `AbortSignal.any` / TypeScript `lib: ["ES2022", "DOM"]`
- **Severity:** Medium
- **Expected Behavior:** Cancelling a provider attempt should deliver one signal that reflects both the router's per-provider budget and the caller's own cancellation, and a router timer should never hold the process open.
- **Actual Behavior:** Cancelling the caller's request could never stop real in-flight provider work, because only the router's budget controller was aborted and the caller's `signal` was never forwarded into the adapter. `AbortSignal.any` is the standard way to compose two signals but is unavailable before Node 20.3, and `setTimeout(...).unref()` fails to type-check under `lib: DOM` (returns `number`), leaving a timer that keeps the process alive. Compounding this, an **already-aborted `AbortSignal` does not replay its `abort` event to listeners attached afterwards**, so the usual `addEventListener('abort', ...)` guard silently never fires for a caller signal that was cancelled before the attempt began. Any attempt-bounding code that only relies on the listener then hangs for the full duration of a provider call.
- **Workaround Implemented:** Added `composeAbortSignal` (uses `AbortSignal.any` when present, otherwise relies on the router mirroring caller aborts onto its own controller) plus an `unrefTimer` helper that probes for `unref` instead of assuming a Node timer, and a distinct `AiProviderCallerAbortError` so caller cancellation is never mistaken for a provider timeout or folded into the aggregate provider-failure error. Because aborted signals do not replay, `attemptWithinBudget` now checks `signal.aborted` explicitly at two points: before creating any timer or calling the provider, and again inside the deadline promise before attaching its listener.
- **Actionable Recommendation:** Declare `"lib": ["ES2022", "DOM"]` together with `@types/node` so Node timers type-check, and consider a small shared "attempt scope" helper (`runWithinBudget(signal, budgetMs, fn)`) so every AI subsystem gets correctly composed cancellation instead of re-deriving it.

---

### [FL-006] Per-Provider Timeout Budgets Are Coupled To The Global Ceiling, So Raising Them Silently Truncates The Fallback Chain
- **Date:** 2026-10-02
- **Component / SDK:** `@wisp/ai-engine` provider router (`AiProviderRouter`, `groq/gemini/openrouter/ollama.adapter.ts`)
- **Severity:** Medium
- **Expected Behavior:** Raising a slow provider's default timeout (a review request to move Gemini to 8000ms and OpenRouter to 10000ms) should only make that provider more patient. Instead it changes which providers are reachable at all.
- **Actual Behavior:** `AiProviderRouter` bounds a request by `globalTimeoutMs` (default 15000) and refuses to start an attempt once the remaining budget drops below `minAttemptMs` (default 3000). Every adapter budget is therefore only granted if the *preceding* budgets leave at least `minAttemptMs` behind. Measured against the real router with all four providers hanging: the shipped defaults `2000/3000/4000/15000` attempt all four providers, while the proposed `5000/8000/10000/15000` attempts only Groq and Gemini and then raises `AiGlobalTimeoutError` after 13s — OpenRouter is never reached and the local `Ollama` fallback becomes unreachable code, regressing the "validated real-provider routing and automatic fallback chain" deliverable. The safe envelope is `groq + gemini + openrouter <= globalTimeoutMs - minAttemptMs`; `2500/4000/4500/15000` was measured to keep all four reachable.
- **Workaround Implemented:** The proposed numbers were **not** applied. `AiCompletionRequest` already carries `globalTimeoutMs`, `minAttemptMs` and `timeoutMs`, and `WispAiEngineConfig` already accepts `adapters?: IAiModelAdapter[]`, so a deployment can raise both the ceiling and an individual adapter's `timeoutMs` together without a code change; that is the supported way to buy the headroom. A regression test now pins the coupling (`keeps every shipped provider reachable inside the default global budget` asserts `sum(groq, gemini, openrouter) <= globalTimeoutMs - minAttemptMs` against the shipped constants and fails if the proposed `5000/8000/10000/15000` is ever applied), so any future default change that truncates the chain fails loudly.
- **Actionable Recommendation:** Treat the global ceiling, `minAttemptMs` and the per-adapter budgets as one budget to be tuned from real p95 latency telemetry rather than three independent constants, and assert `sum(remote adapter budgets) <= globalTimeoutMs - minAttemptMs` in CI so a "just raise this timeout" change cannot silently disable fallback.

---

### [FL-007] `node --test` Reports A Fully Non-Executing Test File As `fail 0`, Because Unref'd Provider Timers Drain The Event Loop
- **Date:** 2026-10-03
- **Component / SDK:** Node.js `node:test` runner / `@wisp/ai-engine` provider router (`provider-router.ts`, `errors.ts`)
- **Severity:** High
- **Expected Behavior:** A green test run should mean every test executed its assertions. If a suite cannot run, the runner should report it as a failure so a reviewer or CI gate cannot mistake it for a pass.
- **Actual Behavior:** `testing/ai-integration/provider-timeouts.test.ts` cancelled **all 28 of its own tests** — on its own, in isolation — and every one was reported with `failureType: 'cancelledByParent'`, `error: 'Promise resolution is still pending but the event loop has already resolved'`, and `duration_ms: 4` on the first test. The suite aggregate printed `# fail 0`, so `npm test` reported `tests 123 / pass 95 / fail 0 / cancelled 28` and looked green while a quarter of the suite never ran an assertion. The cause is an interaction with the FL-005 timer-hygiene change: the router unrefs its per-attempt budget timer (`unrefTimer(setTimeout(abortForBudget, budgetMs))` in `provider-router.ts`) so a pending provider attempt can never block process shutdown, and the cooperative test adapter unrefs its own work timer for the same reason. Those two timers are the *only* pending work while a timeout test waits, so in a bare `node --test` process nothing holds the event loop open, it drains immediately, and the router's deadline never gets a chance to fire. The global ceiling could not mask this because it is a between-attempts arithmetic check (`remainingMs < minAttemptMs`), not a timer. `cancelled` is not a failure state, so a `fail`-only CI gate treats a file that executed zero assertions as green.
- **Workaround Implemented:** Added a single referenced `setInterval` guard at module scope in `provider-timeouts.test.ts`, released in an `after` hook so the runner can still exit. It stands in for the HTTP server handle that keeps the loop alive in production, which is the only reason the unref is safe at runtime. The file now reports `tests 28 / pass 28 / cancelled 0`, and the full suite reports `tests 123 / pass 123 / fail 0 / cancelled 0`.
- **Actionable Recommendation for Amazon / Maintainers:** Have CI treat `cancelled > 0` as a failure rather than relying on `fail` alone, since `node --test` can report a suite that ran no assertions as successful. For libraries that unref internal timers by design, document that a caller awaiting such a deadline in a standalone process must hold its own handle, or ship a test helper that does so.

---

### [FL-008] `provider-timeouts.test.ts` Cancels Every Test In The File, And `npm run typecheck` Cannot Run At All
- **Date:** 2026-10-03
- **Component / SDK:** `testing/ai-integration/provider-timeouts.test.ts` / root `npm run typecheck`
- **Severity:** Medium
- **Expected Behavior:** A green `npm run test:ai` / `npm run typecheck` should mean the suite and the types were verified, so a reviewer can trust the reported pass count.
- **Actual Behavior:** Two independent blind spots. First, `provider-timeouts.test.ts` cancels **all 28 of its own tests** when run on its own (`node --test testing/ai-integration/provider-timeouts.test.ts` → `tests 28 / pass 0 / fail 0 / cancelled 28`), each with `error: 'Promise resolution is still pending but the event loop has already resolved'`. Node reports these as neither passing nor failing, so a full `npm run test:ai` prints `# fail 0` and looks clean while a quarter of the suite never executed an assertion. Second, `npm run typecheck` exits 127 (`sh: 1: tsc: not found`) in every workspace because `typescript` is a root devDependency that is not installed and the repo ships no lockfile (same root cause as FL-004), so there is no typecheck signal available at all.
- **Workaround Implemented:** Verified the quiz-validation change by running `node --test testing/ai-integration/output-validation.test.ts` directly (`tests 67 / pass 67 / fail 0 / cancelled 0`) instead of trusting the aggregate `fail 0`, and confirmed the 28 cancellations are pre-existing and unrelated by running `provider-timeouts.test.ts` in isolation with no import of the module under test. Type changes were verified at runtime through Node's type stripping rather than by `tsc`.
- **Actionable Recommendation:** Make the timeout tests drive a fake clock instead of real timers so the event loop always drains, and add a CI guard that fails the build when any suite reports `cancelled > 0` — `fail 0` alone currently conceals a fully non-executing test file. Separately, commit a lockfile so `npm ci` restores `typescript` and `typecheck` becomes a real gate.

---

### [FL-009] NestJS `nest build` Fails When Consuming Monorepo Packages With Explicit `.ts` Imports (TS5097)
- **Date:** 2026-10-02
- **Component / SDK:** NestJS CLI (`@nestjs/cli` + `tsc`) / TypeScript 5.7+ / Monorepo Workspace Imports
- **Severity:** Medium
- **Expected Behavior:** When `@wisp/backend` imports `@wisp/ai-engine` (which uses `.ts` extension specifiers for Node.js native execution per FL-003), NestJS compilation via `nest build` should compile seamlessly.
- **Actual Behavior:** TypeScript compiler (`tsc`) aborted with 36 instances of `error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled`.
- **Workaround Implemented:** Added `"allowImportingTsExtensions": true` and `"rewriteRelativeImportExtensions": true` to `backend/tsconfig.json`. This leverages TypeScript 5.7+'s ability to resolve `.ts` relative imports and automatically rewrite them during JavaScript emission.
- **Actionable Recommendation:** Monorepo templates combining Node native TypeScript execution packages and NestJS application services should preconfigure `rewriteRelativeImportExtensions: true` in downstream consuming projects.

---

### [FL-010] The Supabase Project Moved From `database/supabase` To A Top-Level `supabase/` On `main`, Silently Inverting The Test Fixtures On Every Other Branch
- **Date:** 2026-10-03
- **Component / SDK:** Git branch topology / `testing/database/schema-and-seeds.test.ts`
- **Severity:** Medium
- **Expected Behavior:** A test that reads a migration file should either resolve it unambiguously or fail loudly with the path it tried, so a directory reorganization on one branch is caught at review time rather than after merge.
- **Actual Behavior:** `main` relocated the Supabase project to a top-level `supabase/` and deleted the old `database/` tree, and updated `testing/database/schema-and-seeds.test.ts` to read `supabase/migrations/...` and `supabase/seed.sql`. Branches that predate the move still carry `database/migrations/...` and `database/seeds/seed_demo_catalog.sql`. A branch that "fixes" the fixture by pointing at its own layout therefore produces a file that merges without conflict (the two sides touch different lines) and then fails immediately after the merge, because the directory it names no longer exists. The failure surfaces as an unrelated-looking `ENOENT` in a database suite rather than as a layout conflict.
- **Workaround Implemented:** Replaced the hardcoded `path.resolve` calls with a `readSqlAsset(...candidates)` helper that probes the post-move `supabase/` paths first and falls back to the pre-move `database/` paths, throwing a single error listing every path it tried when neither exists. The suite passes on both layouts, so the branch stays mergeable in either direction.
- **Actionable Recommendation for Amazon / Maintainers:** Keep asset locations behind a single resolver module rather than inline `path.resolve` calls scattered across suites, and include directory moves in the branch-coordination policy so a reorg lands with a follow-up commit on every open branch in the same merge.

---

### [FL-011] Node.js Native Test Runner (`node --test`) Hangs When Importing NestJS Main File Due to Eager `bootstrap()` Execution
- **Date:** 2026-10-04
- **Component / SDK:** Node.js v24 Test Runner (`node --test`) / NestJS Entrypoint (`backend/src/main.ts`)
- **Severity:** Medium
- **Expected Behavior:** Importing helper functions (such as environment validators or configuration loaders) from `main.ts` or compiled `dist/main.js` into test suites should not start background HTTP listeners or hang the test runner.
- **Actual Behavior:** Node.js top-level execution in `main.ts` invoked `bootstrap()` upon being imported by the test file. NestJS started listening on port 3000, leaving an active TCP server handle in the libuv event loop and preventing `node --test` from terminating.
- **Workaround Implemented:** Decoupled `validateEnvironment` into a dedicated `common/config/environment.validator.ts` module and guarded `main.ts` with a CLI entrypoint check (`require.main === module` or `process.argv[1]` matching `main.js`/`main.ts`) before running `bootstrap()`.
- **Actionable Recommendation:** Always decouple environment validation, configuration factories, and standalone startup hooks from the NestJS application entrypoint to guarantee that test runners can inspect configuration logic without triggering HTTP listener side-effects.

---

### [FL-012] PostgreSQL 18 Schema Permissions and `SECURITY DEFINER` Caller Resolution in Embedded PGlite Integration Testing
- **Date:** 2026-10-05
- **Component / SDK:** PostgreSQL 18 / `@electric-sql/pglite` / Supabase Migrations (`0006`, `0007`)
- **Severity:** Medium
- **Expected Behavior:** Running Supabase migration scripts against embedded PostgreSQL instances with created roles (`anon`, `authenticated`, `service_role`) should evaluate role-based RPC checks (`public.is_service_role_caller()`) seamlessly.
- **Actual Behavior:** In PostgreSQL 18, `SECURITY DEFINER` functions switch `current_user` to the function definer (`postgres`), causing naive checks like `current_user = 'service_role'` to fail. Furthermore, PostgreSQL 18 default schema ACLs deny non-owner roles table access unless explicit grants are executed.
- **Workaround Implemented:** Replicated the production `is_service_role_caller()` logic from `0002_temporal_context_functions.sql` inspecting `session_user` and `current_setting('role')`, and added explicit schema/table privilege grants to `service_role` in the test setup.
- **Actionable Recommendation:** When writing real PostgreSQL migration integration tests with `pglite`, emulate Supabase's full auth role context and default schema grants before running multi-role authorization assertions.

---

### [FL-009] Enforcing Strict HTTP Payload Limits in NestJS Requires Disabling Implicit Body Parser (`bodyParser: false`)
- **Date:** 2026-10-06
- **Component / SDK:** NestJS HTTP Boundary (`NestFactory.create`) / Express `body-parser`
- **Severity:** Low
- **Expected Behavior:** Calling `app.use(json({ limit: '16kb' }))` in `main.ts` should enforce a 16 KB request payload limit on incoming JSON requests.
- **Actual Behavior:** By default, `NestFactory.create(AppModule)` automatically registers Express `json()` and `urlencoded()` with a default 100 KB limit ahead of user-defined middleware. Adding subsequent `app.use(json({ limit: '16kb' }))` does not supersede the already mounted parser, allowing payloads up to 100 KB to be fully buffered into memory before application filters can intercept them.
- **Workaround Implemented:** Initialized the Nest application with `{ bodyParser: false }` (`NestFactory.create(AppModule, { bodyParser: false })`) and explicitly registered `json({ limit: '16kb' })` and `urlencoded({ extended: true, limit: '16kb' })` before mounting global prefix and guards. Added `GlobalHttpExceptionFilter` error mapping for `entity.too.large` returning HTTP 413 `PayloadTooLargeException`.
- **Actionable Recommendation for Amazon / Maintainers:** Document the `{ bodyParser: false }` requirement prominently in backend security checklists when configuring custom HTTP payload limits on NestJS gateway services.

---

### [FL-010] Global Guards Running Ahead of Route-Level Token Verification Can Erode Defense-in-Depth Identity Guarantees
- **Date:** 2026-10-08
- **Component / SDK:** NestJS Guards Pipeline / Device Authentication / Edge Rate Limiter
- **Severity:** High
- **Expected Behavior:** Global rate limit guards should meter authenticated callers by verified device identity and reject or safely bucket unauthenticated callers without allowing client-spoofed headers to create unbounded rate-limiting buckets.
- **Actual Behavior:** When rate limiting was registered as a global guard while device authentication was mounted as a route-level guard (`DeviceAuthGuard`), the global guard executed first. Resolving device identity from unverified client headers (`X-FireTV-Device-Id` or request body) allowed callers to spoof arbitrary identities to bypass rate limits or DoS shared buckets. Furthermore, fail-open fallback during database RPC outages completely disabled device protection.
- **Workaround Implemented:** Reordered identity derivation to strictly require valid cryptographic device tokens for authenticated device bucketing, keyed unauthenticated callers strictly by trusted client IP (`ip:${clientIp}`), and enforced fail-closed HTTP 503 responses in production when rate limit RPCs fail or emit malformed reset timestamps.
- **Actionable Recommendation for Amazon / Maintainers:** Ensure gateway frameworks and architecture blueprints explicitly document guard execution order hierarchies between global pre-auth rate limiters and route-level cryptographic token authenticators, emphasizing fail-closed defaults and IP-based fallback over unverified client headers.

---

### [FL-011] Edge KV Caching of Dynamic AI Endpoints Causes Cross-Tenant Leakage and Freshness Gaps
- **Date:** 2026-10-10
- **Component / SDK:** Cloudflare Workers KV / Edge Gateway / NestJS AI Gateway
- **Severity:** High
- **Expected Behavior:** Edge caching should accelerate repeat AI queries while maintaining absolute tenant isolation and freshness boundaries.
- **Actual Behavior:** Caching POST `/wisp/query` responses at the Cloudflare Edge KV tier lacked visibility into profile ownership, viewer device tokens, and atomic cache validation. In shared household environments or multi-tenant deployments, caching dynamic user queries at the edge risked serving cached responses across unverified devices and bypassed server-side anti-spoiler playhead clamping.
- **Workaround Implemented:** Bypassed edge KV caching completely for `/wisp/query`, routing all queries directly to the NestJS origin with `Cache-Control: private, no-cache, no-store, must-revalidate`. Relied on the backend's deterministic sub-10ms PostgreSQL temporal cache (`get_or_touch_ai_cache`) which performs complete device token authentication, profile ownership checks, and runtime schema/spoiler boundary validation before serving or storing cards.
- **Actionable Recommendation for Cloudflare / Amazon Maintainers:** Clearly designate edge caching patterns for static assets vs user-specific AI inference. Never place shared edge KV caches in front of authenticated user-personalized AI endpoints without end-to-end device cryptographic binding.

---

### [FL-012] Binding CSRF Tokens Exclusively to Client IPs Breaks Mobile/NAT Viewers While Lacking Session Anchors
- **Date:** 2026-10-11
- **Component / SDK:** CSRF Defense / Express Cookie Parser / Mobile Hotspots & CGNAT
- **Severity:** Medium
- **Expected Behavior:** CSRF tokens bound to client identity should prevent cross-origin request forgery without disrupting legitimate users whose outbound network IP changes dynamically.
- **Actual Behavior:** Binding CSRF tokens solely to `clientIp` caused frequent false-positive CSRF rejections for Fire TV devices connected to dynamic 4G/5G mobile hotspots or Carrier-Grade NAT (CGNAT) pools where egress IPs rotate between requests. Additionally, without session cookies, untrusted direct HTTP requests could forge forwarding headers (`X-Forwarded-For`) to manipulate IP-bound tokens.
- **Workaround Implemented:** Introduced server-managed `wisp_csrf_session` HttpOnly cookies to bind CSRF tokens to stable browser/client sessions (`session:<sessionId>`), falling back to trusted socket client IPs (`ip:<clientIp>`) only when cookies are disabled. Enforced strict proxy boundaries (`TRUST_PROXY`) so forwarding headers are never trusted on direct connections.
- **Actionable Recommendation for Maintainers:** When designing CSRF token binding for consumer TV and web applications, anchor tokens to cryptographically random, server-managed HttpOnly session cookies rather than raw client IP addresses.

---

### [FL-013] `@nestjs/throttler` v6 Method Decorator Typing Rejects Array Options in Favor of Named Storage Dictionary
- **Date:** 2026-10-09
- **Component / SDK:** NestJS Throttler (`@nestjs/throttler` v6) / TypeScript Strict Mode
- **Severity:** Low
- **Expected Behavior:** Declaring custom method-level rate limits via `@Throttle([{ ttl: 60000, limit: 12 }])` should compile and apply per-route overrides matching the `ThrottlerModule.forRoot([...])` array syntax.
- **Actual Behavior:** TypeScript emits `TS2345: Argument of type '{ ttl: number; limit: number; }[]' is not assignable to parameter of type 'Record<string, ThrottlerMethodOrControllerOptions>'. Index signature for type 'string' is missing in type '{ ttl: number; limit: number; }[]'`. In v6, while `forRoot` accepts an array of named configurations, the method decorator `@Throttle(...)` expects a dictionary keyed by named tracker (e.g., `{ default: { limit: 12, ttl: 60000 } }`).
- **Workaround Implemented:** Updated the route-level throttle definition in `AiGatewayController` to `@Throttle({ default: { limit: 12, ttl: 60000 } })`, targeting the default in-memory throttler registered in `AppModule`.
- **Actionable Recommendation:** NestJS Throttler documentation and upgrade guides should explicitly contrast the root module array registration syntax with the method decorator named dictionary signature.

---

### [FL-010] Unhandled Error Telemetry Blind Spot and Log Forgery (CWE-117) in NestJS Request Interceptors
- **Date:** 2026-10-16
- **Component / SDK:** NestJS Interceptors / RxJS `tap` / Centralized Observability (CloudWatch / Datadog)
- **Severity:** Medium
- **Expected Behavior:** An HTTP request telemetry interceptor using `tap()` should capture complete request/response telemetry across all HTTP status codes, and unverified client request headers like `X-Wisp-Device-Id` should be safe to interpolate into log messages.
- **Actual Behavior:** Passing a single callback function to RxJS `tap(() => { ... })` only hooks into successful next emissions; when an endpoint throws an exception (e.g. 400 Bad Request, 401 Unauthorized, 429 Throttled, or 500 Server Error), the interceptor callback never fires, omitting failed requests from access logs. Additionally, raw unverified device headers interpolated directly into log lines expose log collectors to CRLF injection (`\r\n`) and log record forgery (CWE-117).
- **Workaround Implemented:** Upgraded `tap()` to pass a full observer object `{ next: () => ..., error: (err) => ... }` so failed responses are logged with status code and error messages, and sanitized control characters `/[\r\n\x00-\x1F\x7F]/g` with length bounding (64 chars) while prioritizing verified device claims `(req as any).device?.id`.
- **Actionable Recommendation:** Provide a built-in NestJS logging interceptor utility with automated CRLF stripping and dual next/error stream observation out of the box.
---

### [FL-014] Fire TV Remote Focus Ring Disappearance on Conditional / Post-Answer UI States
- **Date:** 2026-10-16
- **Component / SDK:** Fire OS Focus Engine / React Native TV Pressable
- **Severity:** Medium
- **Expected Behavior:** Pressable components styled with conditional result borders (such as quiz option selection or entity inspection) should maintain an amber focus ring (`#F59E0B`) when navigated via D-pad after state mutation.
- **Actual Behavior:** When conditional answer evaluation styles (`optionCorrect`, `optionIncorrect`, `optionDimmed`) were applied, state gates like `!isAnswered` suppressed the active `isFocused` focus ring, rendering the cursor invisible to viewers navigating post-answer.
- **Workaround Implemented:** Decoupled `isFocused` styling so that high-contrast focus rings (`#F59E0B`, width 2) override dimmed or static border states, and added explicit `onFocus`/`onBlur` tracking across HUD controls (`catalogButton`, `scrubButton`).
- **Actionable Recommendation:** Provide higher-level TV button primitives with an `isFocused` higher-priority overlay layer that cannot be inadvertently overwritten by custom component state styling.

