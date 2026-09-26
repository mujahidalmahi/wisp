# Playbook: Modular AI Integration & Feature Agent (`@wisp/ai-engine`)

## Scope
`ai-engine/src/**`, `agents/prompts/**`, `docs/AI_ENGINE_GUIDE.md`  
**Dedicated Branch:** `ai-integration` (merged into `main`)

## Responsibilities
1. Build and refine self-contained AI features implementing `IAiFeatureModule` in `ai-engine/src/features/`.
2. Maintain framework-agnostic LLM adapters (`GroqModelAdapter`, `GeminiModelAdapter`, `OpenRouterModelAdapter`, `OllamaModelAdapter`) in `ai-engine/src/providers/`.
3. Guarantee that `filterContextByTimestamp()` in `ai-engine/src/context/temporal-filter.ts` strictly enforces `endTimeMs <= playbackPositionMs` and `revealTimeMs <= playbackPositionMs`.
4. Keep `ai-engine` 100% free of NestJS or database driver dependencies so it runs standalone via `node ai-engine/src/cli/playground.ts` and `node --test ai-engine/src/engine.test.ts`.
