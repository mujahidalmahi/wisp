# Branch Guide: `ai-integration` (Modular AI Engine & Features Workstream)

## 1. Branch Goal
The **`ai-integration`** branch is dedicated to developing, testing, and refining Wisp's **Standalone Modular AI Engine** ([`ai-engine/`](../../ai-engine/README.md) — `@wisp/ai-engine`), including **AI feature pipelines**, **LLM provider adapters & fallback routing**, and **deterministic anti-spoiler temporal filtering**—all executable without requiring the backend server or database to be online.

## 2. Primary Ownership Scope
- **`ai-engine/src/features/`** — Pluggable AI feature modules (`ContextualQaFeature`, `EntityExplainerFeature`, `SceneExplainerFeature`, `EpisodeRecapFeature`, `InteractiveQuizFeature`, and new custom features).
- **`ai-engine/src/providers/`** — Model adapters (`GroqModelAdapter`, `GeminiModelAdapter`, `OpenRouterModelAdapter`, `OllamaModelAdapter`) and `AiProviderRouter`.
- **`ai-engine/src/context/`** — Pure-TS anti-spoiler temporal filter (`temporal-filter.ts`), `embedded-catalog.ts`, and `context-sources.ts`.
- **`agents/prompts/` & `docs/AI_ENGINE_GUIDE.md`** — Prompt specifications and developer guide.

## 3. Active Tasks & Roadmap for `ai-integration`
- [x] Create framework-agnostic `@wisp/ai-engine` with `WispAiEngine`, `AiFeatureRegistry`, and `AiProviderRouter`.
- [x] Implement pure-TS `filterContextByTimestamp` enforcing `endTimeMs <= playbackPositionMs` and `revealTimeMs <= playbackPositionMs`.
- [x] Build standalone CLI playground (`ai-engine/src/cli/playground.ts`) and unit test suite (`ai-engine/src/engine.test.ts`).
- [ ] Expand `embedded-catalog.ts` with complete scene-by-scene transcripts and progressive lore reveals across all 3 demo programs (*Tears of Steel*, *Cosmic Origins: Deep Field*, *The Midnight Cipher*).
- [ ] Add live provider benchmark & schema-validation tests across Groq (`llama-3.3-70b-versatile`), Gemini (`gemini-2.5-flash`), and OpenRouter.
- [ ] Implement dynamic **Follow-Up Chip Ranking** so suggested follow-up pills adapt to entities present in the active scene.

## 4. Development & Verification Commands (`ai-integration`)
```bash
node --test ai-engine/src/engine.test.ts
npm run ai:playground
```
