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

### [FL-005] Node.js Native Test Runner (`node --test`) Hangs When Importing NestJS Main File Due to Eager `bootstrap()` Execution
- **Date:** 2026-10-04
- **Component / SDK:** Node.js v24 Test Runner (`node --test`) / NestJS Entrypoint (`backend/src/main.ts`)
- **Severity:** Medium
- **Expected Behavior:** Importing helper functions (such as environment validators or configuration loaders) from `main.ts` or compiled `dist/main.js` into test suites should not start background HTTP listeners or hang the test runner.
- **Actual Behavior:** Node.js top-level execution in `main.ts` invoked `bootstrap()` upon being imported by the test file. NestJS started listening on port 3000, leaving an active TCP server handle in the libuv event loop and preventing `node --test` from terminating.
- **Workaround Implemented:** Decoupled `validateEnvironment` into a dedicated `common/config/environment.validator.ts` module and guarded `main.ts` with a CLI entrypoint check (`require.main === module` or `process.argv[1]` matching `main.js`/`main.ts`) before running `bootstrap()`.
- **Actionable Recommendation:** Always decouple environment validation, configuration factories, and standalone startup hooks from the NestJS application entrypoint to guarantee that test runners can inspect configuration logic without triggering HTTP listener side-effects.



