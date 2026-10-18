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

### [FL-004] Fire TV Remote Focus Ring Disappearance on Conditional / Post-Answer UI States
- **Date:** 2026-10-16
- **Component / SDK:** Fire OS Focus Engine / React Native TV Pressable
- **Severity:** Medium
- **Expected Behavior:** Pressable components styled with conditional result borders (such as quiz option selection or entity inspection) should maintain an amber focus ring (`#F59E0B`) when navigated via D-pad after state mutation.
- **Actual Behavior:** When conditional answer evaluation styles (`optionCorrect`, `optionIncorrect`, `optionDimmed`) were applied, state gates like `!isAnswered` suppressed the active `isFocused` focus ring, rendering the cursor invisible to viewers navigating post-answer.
- **Workaround Implemented:** Decoupled `isFocused` styling so that high-contrast focus rings (`#F59E0B`, width 2) override dimmed or static border states, and added explicit `onFocus`/`onBlur` tracking across HUD controls (`catalogButton`, `scrubButton`).
- **Actionable Recommendation:** Provide higher-level TV button primitives with an `isFocused` higher-priority overlay layer that cannot be inadvertently overwritten by custom component state styling.

---

### [FL-005] Fire TV Virtual Device Emulation: CLI Orientation Default & ADB Daemon Drop
- **Date:** 2026-10-18
- **Component / SDK:** Amazon / Android Virtual Device Manager (`avdmanager`), Android Emulator (`emulator.exe`), ADB Daemon
- **Severity:** Medium
- **Expected Behavior:** Creating a 1080p TV AVD via `avdmanager create avd -n FireTV_1080p -d "tv_1080p"` should initialize with a landscape 1080p profile (`1920x1080`, `hw.initialOrientation=landscape`) and maintain persistent ADB socket connectivity for testing without physical Fire TV hardware per Amazon developer documentation.
- **Actual Behavior:** The default profile created by `avdmanager` wrote `hw.initialOrientation=portrait` and `target=android-0` into `config.ini`, causing orientation mismatches. Furthermore, when launching the emulator via non-interactive automated test environments on Windows, transient shell sessions terminating the background ADB server left the virtual device in `offline` state indefinitely (`error: device offline`).
- **Workaround Implemented:** Programmatically patched `config.ini` with `hw.initialOrientation=landscape`, `hw.gpu.enabled=yes`, `hw.keyboard=yes`, `target=android-36.1`, and `hw.ramSize=2048M`, and started a persistent foreground ADB server (`adb -P 5037 nodaemon server`) before launching the emulator. The virtual Fire TV 1080p device booted successfully (`sys.boot_completed=1`) and verified full 1080p density (320 dpi).
- **Actionable Recommendation for Amazon / Maintainers:** Provide a dedicated Fire TV CLI tool or predefined hardware profile descriptor (`firetv-4k-max.xml`) in the Amazon developer portal that generates turnkey landscape AVD configurations with appropriate heap and GPU defaults out-of-the-box.

