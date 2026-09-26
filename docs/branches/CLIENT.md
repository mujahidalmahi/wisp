# Branch Guide: `client` (Amazon Fire TV 10-Foot UI Workstream)

## 1. Branch Goal
The **`client`** branch is dedicated to building, polishing, and validating Wisp's **10-Foot Amazon Fire TV React Native Application** (`frontend/`), including D-pad spatial focus navigation, video player surface, the **Two-Stage Instant Contextual Overlay Drawer**, **Zero-Typing Quick Action Chips**, and **Household Viewing Mode** selectors.

## 2. Primary Ownership Scope
- **`frontend/`** — React Native (`react-native-tvos`) + TypeScript 10-foot UI components, D-pad remote hooks, API client, and TV theme tokens.
- **`docs/FIRE_TV_UX_GUIDE.md`** — 10-foot typography, overscan rules, and remote key mappings.
- **`agents/playbooks/fire-tv-ui-agent.md`** — Agent playbook for Fire TV UI engineering.

## 3. Active Tasks & Roadmap for `client`
- [x] Scaffold 10-foot `VideoPlayerSurface`, `WispOverlayDrawer`, `QuickActionChips`, and `ProfileModeSelector`.
- [x] Implement `useTVRemoteHandler` for Fire TV remote keys (`menu`, `longSelect`, `playPause`, `back`).
- [x] Connect `WispApiClient` with automatic fallback to `@wisp/ai-engine`'s standalone context catalog when offline.
- [ ] Build the **3-Genre Program Catalog Home Screen** (*Tears of Steel*, *Cosmic Origins: Deep Field*, *The Midnight Cipher*) with D-pad poster carousel.
- [ ] Build the interactive **Post-Watch Trivia Quiz Card** (`quizPayload` 4-option D-pad selector with instant answer reveal).
- [ ] Build the **Session Context Trail / Pinned Insights Drawer** so viewers can step back through previous cards opened during the episode.
- [ ] Validate APK packaging and focus behavior on Fire OS Emulator / Fire TV hardware.

## 4. Development & Verification Commands (`client`)
```bash
npm run dev:frontend
npm run android:firetv
npm --workspace=frontend run typecheck
```
