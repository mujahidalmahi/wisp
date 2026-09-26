## Summary

Briefly describe what this PR implements or fixes.

## Working-Feature Validation Gate (Section 8.1)

- [ ] **1. Invokable on Fire TV UI:** Triggerable via Fire TV remote / D-pad with visible focus ring.
- [ ] **2. Reaches Real Backend:** Calls NestJS API (`http://10.0.2.2:3000/api/v1` or Cloudflare Edge).
- [ ] **3. Real Temporal Context:** Queries `get_spoiler_safe_context` bounded by `playbackPositionMs`.
- [ ] **4. Real AI Provider:** Tested against Groq / Gemini / OpenRouter / local Ollama (no hardcoded AI strings).
- [ ] **5. Consumed by Client:** Structured JSON parsed and rendered into `WispOverlayDrawer`.
- [ ] **6. Visible on 10-Foot UI:** Respects overscan margins and distance-readable typography.
- [ ] **7. Failure States Handled:** Network/quota errors surface cleanly without pretending success.

## Friction Log Update (10% Hackathon Bonus)
- [ ] Added any encountered SDK/tooling issues to [`docs/FRICTION_LOG.md`](../docs/FRICTION_LOG.md) (or N/A).
