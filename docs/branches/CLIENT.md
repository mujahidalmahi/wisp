# Branch Guide: `client` — Role Category III (Frontend, UI/UX)

- **Role Category:** `03 — Frontend, UI/UX`
- **Assigned Team Members:** **Kazi Rahad Ali**, **Shahariar Hossain Jibon**
- **Primary Workspaces:** [`frontend/`](../../frontend/README.md), [`docs/FIRE_TV_UX_GUIDE.md`](../FIRE_TV_UX_GUIDE.md)

---

## 1. Category Mandate
Own the Fire TV user interface and 10-foot interaction experience, including remote/D-pad spatial focus navigation, screen structure, visual presentation, contextual overlays, and user-facing application states.

---

## 2. Principal Deliverables
- Functional Fire TV client built with React Native (`react-native-tvos`) + TypeScript (`frontend/`).
- Remote-friendly navigation and predictable D-pad focus behavior (`useTVRemoteHandler`, `hasTVPreferredFocus`).
- Core viewing and contextual-assistance flows (`VideoPlayerSurface`, `WispOverlayDrawer`, `QuickActionChips`, `ProfileModeSelector`).
- Integrated AI result presentation with complete loading, success, empty, error, timeout, and recovery states.
- Submission-ready demonstration flow respecting 10-foot readability (`>= 22sp`) and 5% overscan margins.

---

## 3. Dependencies & Coordination Matrix

| Working Relationship | Required Coordination |
| :--- | :--- |
| **Backend, Database & Security (`server`)** | Consume documented REST APIs, data structures, session behavior, and error contracts (`WispApiClient`). |
| **AI Integration (`ai-integration`)** | Consume AI response structures (`WispResponseCard`), interaction triggers, loading behavior, and fallback states. |
| **QA & Testing (`testing`)** | Provide testable builds and communicate changes to D-pad navigation, components, and interaction behavior. |
| **Research & Documentation (`docs`)** | Provide screen flows, UI behavior descriptions, and implementation details required for documentation. |

---

## 4. Development & Verification Commands
```bash
npm run dev:frontend
npm run android:firetv
npm run test:frontend
```
