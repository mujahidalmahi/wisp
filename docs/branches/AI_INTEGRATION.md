# Branch Guide: `ai-integration` — Role Category II (AI Integration & AI Features)

- **Role Category:** `02 — AI Integration & AI Features`
- **Assigned Team Members:** **Shajid Islam Chowdhury**, **Chowdhury Rifat Ahmed**
- **Primary Workspaces:** [`ai-engine/`](../../ai-engine/README.md), [`agents/prompts/`](../../agents/README.md), [`docs/AI_ENGINE_GUIDE.md`](../AI_ENGINE_GUIDE.md)

---

## 1. Category Mandate
Own the implementation and integration of Wisp's AI-powered capabilities in `@wisp/ai-engine`. AI work shall remain strictly grounded in temporal content/context (`00:00 → playbackPositionMs`) and exposed cleanly through the secure backend architecture.

---

## 2. Principal Deliverables
- Working AI feature integrations (`ContextualQaFeature`, `EntityExplainerFeature`, `SceneExplainerFeature`, `EpisodeRecapFeature`, `InteractiveQuizFeature`).
- Validated real-provider path (`GroqModelAdapter`, `GeminiModelAdapter`, `OpenRouterModelAdapter`, `OllamaModelAdapter`).
- Structured AI request/response contracts (`ai-engine/src/types/index.ts`).
- Multi-provider routing, automatic failover, and 15-second timestamp bucket caching (`AiProviderRouter`, `WispAiEngine`).
- AI configuration and technical documentation (`docs/AI_ENGINE_GUIDE.md`).

---

## 3. Dependencies & Coordination Matrix

| Working Relationship | Required Coordination |
| :--- | :--- |
| **Backend, Database & Security (`server`)** | Define context/data requirements (`TemporalProgramContext`), secure service interfaces, provider configuration, validation, and limits. |
| **Frontend, UI/UX (`client`)** | Define feature triggers (`WispActionType`), response card structures (`WispResponseCard`), loading states, result presentation, and failure states. |
| **QA & Testing (`testing`)** | Provide representative prompts, expected grounded behavior, failure cases, provider-switch cases, and regression scenarios. |
| **Research & Documentation (`docs`)** | Record AI providers, APIs/SDKs, configuration, limitations, decisions, and validated capabilities. |

---

## 4. Development & Verification Commands
```bash
npm run ai:playground
npm run test:ai
```
