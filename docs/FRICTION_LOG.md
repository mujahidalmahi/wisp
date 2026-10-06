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

### [FL-004] NestJS `nest build` Fails When Consuming Monorepo Packages With Explicit `.ts` Imports (TS5097)
- **Date:** 2026-10-02
- **Component / SDK:** NestJS CLI (`@nestjs/cli` + `tsc`) / TypeScript 5.7+ / Monorepo Workspace Imports
- **Severity:** Medium
- **Expected Behavior:** When `@wisp/backend` imports `@wisp/ai-engine` (which uses `.ts` extension specifiers for Node.js native execution per FL-003), NestJS compilation via `nest build` should compile seamlessly.
- **Actual Behavior:** TypeScript compiler (`tsc`) aborted with 36 instances of `error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled`.
- **Workaround Implemented:** Added `"allowImportingTsExtensions": true` and `"rewriteRelativeImportExtensions": true` to `backend/tsconfig.json`. This leverages TypeScript 5.7+'s ability to resolve `.ts` relative imports and automatically rewrite them during JavaScript emission.
- **Actionable Recommendation:** Monorepo templates combining Node native TypeScript execution packages and NestJS application services should preconfigure `rewriteRelativeImportExtensions: true` in downstream consuming projects.

---

### [FL-005] `node --test` Reports A Fully Non-Executing Test File As `fail 0`, Because Unref'd Provider Timers Drain The Event Loop
- **Date:** 2026-10-03
- **Component / SDK:** Node.js `node:test` runner / `@wisp/ai-engine` provider router (`provider-router.ts`, `errors.ts`)
- **Severity:** High
- **Expected Behavior:** A green test run should mean every test executed its assertions. If a suite cannot run, the runner should report it as a failure so a reviewer or CI gate cannot mistake it for a pass.
- **Actual Behavior:** `testing/ai-integration/provider-timeouts.test.ts` cancelled **all 28 of its own tests** — on its own, in isolation — and every one was reported with `failureType: 'cancelledByParent'`, `error: 'Promise resolution is still pending but the event loop has already resolved'`, and `duration_ms: 4` on the first test. The suite aggregate printed `# fail 0`, so `npm test` reported `tests 123 / pass 95 / fail 0 / cancelled 28` and looked green while a quarter of the suite never ran an assertion. The cause is an interaction with the FL-005 timer-hygiene change: the router unrefs its per-attempt budget timer (`unrefTimer(setTimeout(abortForBudget, budgetMs))` in `provider-router.ts`) so a pending provider attempt can never block process shutdown, and the cooperative test adapter unrefs its own work timer for the same reason. Those two timers are the *only* pending work while a timeout test waits, so in a bare `node --test` process nothing holds the event loop open, it drains immediately, and the router's deadline never gets a chance to fire. The global ceiling could not mask this because it is a between-attempts arithmetic check (`remainingMs < minAttemptMs`), not a timer. `cancelled` is not a failure state, so a `fail`-only CI gate treats a file that executed zero assertions as green.
- **Workaround Implemented:** Added a single referenced `setInterval` guard at module scope in `provider-timeouts.test.ts`, released in an `after` hook so the runner can still exit. It stands in for the HTTP server handle that keeps the loop alive in production, which is the only reason the unref is safe at runtime. The file now reports `tests 28 / pass 28 / cancelled 0`, and the full suite reports `tests 123 / pass 123 / fail 0 / cancelled 0`.
- **Actionable Recommendation for Amazon / Maintainers:** Have CI treat `cancelled > 0` as a failure rather than relying on `fail` alone, since `node --test` can report a suite that ran no assertions as successful. For libraries that unref internal timers by design, document that a caller awaiting such a deadline in a standalone process must hold its own handle, or ship a test helper that does so.

---

### [FL-006] The Supabase Project Moved From `database/supabase` To A Top-Level `supabase/` On `main`, Silently Inverting The Test Fixtures On Every Other Branch
- **Date:** 2026-10-03
- **Component / SDK:** Git branch topology / `testing/database/schema-and-seeds.test.ts`
- **Severity:** Medium
- **Expected Behavior:** A test that reads a migration file should either resolve it unambiguously or fail loudly with the path it tried, so a directory reorganization on one branch is caught at review time rather than after merge.
- **Actual Behavior:** `main` relocated the Supabase project to a top-level `supabase/` and deleted the old `database/` tree, and updated `testing/database/schema-and-seeds.test.ts` to read `supabase/migrations/...` and `supabase/seed.sql`. Branches that predate the move still carry `database/migrations/...` and `database/seeds/seed_demo_catalog.sql`. A branch that "fixes" the fixture by pointing at its own layout therefore produces a file that merges without conflict (the two sides touch different lines) and then fails immediately after the merge, because the directory it names no longer exists. The failure surfaces as an unrelated-looking `ENOENT` in a database suite rather than as a layout conflict.
- **Workaround Implemented:** Replaced the hardcoded `path.resolve` calls with a `readSqlAsset(...candidates)` helper that probes the post-move `supabase/` paths first and falls back to the pre-move `database/` paths, throwing a single error listing every path it tried when neither exists. The suite passes on both layouts, so the branch stays mergeable in either direction.
- **Actionable Recommendation for Amazon / Maintainers:** Keep asset locations behind a single resolver module rather than inline `path.resolve` calls scattered across suites, and include directory moves in the branch-coordination policy so a reorg lands with a follow-up commit on every open branch in the same merge.

---

### [FL-007] Node.js Native Test Runner (`node --test`) Hangs When Importing NestJS Main File Due to Eager `bootstrap()` Execution
- **Date:** 2026-10-04
- **Component / SDK:** Node.js v24 Test Runner (`node --test`) / NestJS Entrypoint (`backend/src/main.ts`)
- **Severity:** Medium
- **Expected Behavior:** Importing helper functions (such as environment validators or configuration loaders) from `main.ts` or compiled `dist/main.js` into test suites should not start background HTTP listeners or hang the test runner.
- **Actual Behavior:** Node.js top-level execution in `main.ts` invoked `bootstrap()` upon being imported by the test file. NestJS started listening on port 3000, leaving an active TCP server handle in the libuv event loop and preventing `node --test` from terminating.
- **Workaround Implemented:** Decoupled `validateEnvironment` into a dedicated `common/config/environment.validator.ts` module and guarded `main.ts` with a CLI entrypoint check (`require.main === module` or `process.argv[1]` matching `main.js`/`main.ts`) before running `bootstrap()`.
- **Actionable Recommendation:** Always decouple environment validation, configuration factories, and standalone startup hooks from the NestJS application entrypoint to guarantee that test runners can inspect configuration logic without triggering HTTP listener side-effects.

---

### [FL-008] PostgreSQL 18 Schema Permissions and `SECURITY DEFINER` Caller Resolution in Embedded PGlite Integration Testing
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
