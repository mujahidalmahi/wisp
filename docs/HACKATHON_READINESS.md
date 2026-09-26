# Hackathon Submission Readiness & Demo Script

## 1. Pre-Submission Checklist
- [ ] **Fire TV APK / Simulator Validation:** App installs, launches, plays video, and responds to D-pad remote events on Fire OS emulator/device.
- [ ] **End-to-End Validation Gate:** All 7 steps in `CONTRIBUTING.md` verified for every action chip (`contextual_qa`, `entity_explain`, `scene_explain`, `episode_recap`, `post_watch_quiz`).
- [ ] **Zero-Paywall Judge Access:** Hosted backend & Cloudflare edge configured with active free-tier keys (`Groq` + `Gemini` + `OpenRouter`) so judges can test immediately.
- [ ] **Friction Log Completed:** `docs/FRICTION_LOG.md` updated with all real setup/runtime findings (up to 10% bonus).
- [ ] **Product Feedback Completed:** `docs/PRODUCT_FEEDBACK.md` finalized.
- [ ] **Sub-3-Minute Demo Video:** Uploaded publicly to YouTube/Vimeo.

---

## 2. Sub-3-Minute Demo Video Script

| Time | Visual on Fire TV Screen | Narration / Story Beat |
| :--- | :--- | :--- |
| **0:00 – 0:25** | Viewer watching *Tears of Steel* on Fire TV. Complex cyberpunk dialogue references a breakup 40 years ago. | **The Problem:** Viewers lose context in serialized or dense shows. Searching on a phone breaks immersion and risks massive spoilers. |
| **0:25 – 0:55** | Viewer presses **Menu** on Fire TV remote at `00:35`. Wisp Drawer snaps open in `<100ms` showing `SPOILER-SAFE LOCK @ 00:35` and 3 Zero-Typing Quick Action Chips. | **Stage-1 Instant UI:** No typing on an on-screen keyboard. Wisp tracks the exact playback timestamp and offers context-aware 1-click questions. |
| **0:55 – 1:35** | Viewer clicks *"Who are Thom and Celia?"*. Groq returns a grounded 10-foot card in `<400ms`. Viewer then jumps ahead to `02:15` (Scene 2) and asks again—showing how Celia's lore updates progressively without spoiling the ending. | **Deterministic Anti-Spoiler Engine:** PostgreSQL filters transcript & character facts strictly up to the playhead (`end_time_ms <= playback_ms`). |
| **1:35 – 2:15** | Viewer switches **Household Mode** from `Quick Glance` to `Deep Lore` and `Family Mode` using D-pad Left/Right, then triggers *"Catch me up to this moment"*. | **Household Adaptation:** Wisp adapts explanation depth to who is watching in the living room. |
| **2:15 – 2:50** | Quick architecture overlay showing React Native Fire TV -> Cloudflare Edge -> NestJS AI Gateway -> Supabase PostgreSQL, then pressing **Back** to resume playback seamlessly. | **Engineering Discipline:** Real end-to-end architecture with multi-provider fallback and zero hardcoded AI responses. *"Wisp: A little more, when you need it."* |
