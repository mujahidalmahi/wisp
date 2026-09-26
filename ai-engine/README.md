# `@wisp/ai-engine` — Modular AI Integration & Feature Segment

`@wisp/ai-engine` decouples Wisp's **AI provider adapters**, **spoiler-safe temporal context filtering**, and **AI feature pipelines** from the NestJS backend and Supabase PostgreSQL database.

This allows AI integrations and new AI features to be built, tested, and executed:
1. **Standalone (Zero Backend / Zero Database):** Using the built-in `InMemoryCatalogContextSource` and pure-TypeScript temporal anti-spoiler filter (`filterContextByTimestamp`).
2. **With Custom JSON Context:** Pass arbitrary episode transcripts/scenes directly at runtime without touching SQL migrations.
3. **Inside NestJS Backend or Cloudflare Workers:** Plug in `SupabaseContextSource` or edge KV cache via the `IContextSource` interface without rewriting any prompt or provider logic.
4. **In the Fire TV Client (Hybrid / Direct Prototyping Mode):** Enables UI + AI feature iteration even when the backend server is offline.

---

## Architecture of `@wisp/ai-engine`

```text
ai-engine/
└── src/
    ├── index.ts                        # Public API exports
    ├── engine.ts                       # Unified WispAiEngine facade
    ├── types/
    │   └── index.ts                    # Provider, ContextSource, and Feature interfaces
    ├── context/
    │   ├── embedded-catalog.ts         # Self-contained 3-genre dataset (zero DB needed)
    │   ├── temporal-filter.ts          # Pure-TS deterministic anti-spoiler windowing
    │   └── context-sources.ts          # InMemory, CustomJson, and Callback ContextSources
    ├── providers/
    │   ├── groq.adapter.ts             # Groq (OpenAI-compatible JSON mode)
    │   ├── gemini.adapter.ts           # Google Gemini Flash (native JSON schema)
    │   ├── openrouter.adapter.ts       # OpenRouter free-tier model adapter
    │   ├── ollama.adapter.ts           # Local Ollama adapter (offline development)
    │   └── provider-router.ts          # Priority routing, fallback chain & TTL cache
    ├── features/
    │   ├── base.feature.ts             # Base prompt shaper & JSON card parser
    │   ├── contextual-qa.feature.ts    # Feature 1: Contextual Q&A
    │   ├── entity-explainer.feature.ts # Feature 2: Character/Place/Concept Explainer
    │   ├── scene-explainer.feature.ts  # Feature 3: Scene Event & Motive Explainer
    │   ├── episode-recap.feature.ts    # Feature 4: Spoiler-Safe "Catch Me Up" Recap
    │   ├── interactive-quiz.feature.ts # Feature 5: Grounded Post-Watch Trivia Quiz
    │   └── feature-registry.ts         # Dynamic registry for adding new AI features
    └── cli/
        └── playground.ts               # Zero-backend CLI runner for testing AI features
```

---

## Adding a New AI Feature (Zero Backend/DB Changes Required)

Implement `IAiFeatureModule` in `src/features/` and register it with `engine.registerFeature(myFeature)`:

```ts
import { WispAiEngine } from '@wisp/ai-engine';

const engine = WispAiEngine.createStandalone({
  groqApiKey: process.env.GROQ_API_KEY,
});

const card = await engine.execute({
  episodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  playbackPositionMs: 135000,
  actionType: 'scene_explain',
  prompt: 'Why are they recreating the bridge memory?',
  profileMode: 'quick_glance',
});
```
