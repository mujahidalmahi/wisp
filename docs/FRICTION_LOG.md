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
