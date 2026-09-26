# Modular AI Integration & Feature Guide (`@wisp/ai-engine`)

The [`ai-engine/`](../ai-engine/README.md) workspace (`@wisp/ai-engine`) is Wisp's **framework-agnostic, standalone AI integration and feature engine**.

## 1. Why `ai-engine/` Is Decoupled from Backend & Database

During development and testing, AI engineers and feature contributors need to iterate on:
- New **AI features** (e.g., *Contextual Q&A*, *Entity Explainer*, *Scene Explainer*, *Spoiler-Safe Episode Recap*, *Interactive Quiz*, or new custom features)
- **LLM provider adapters** (*Groq*, *Gemini Flash*, *OpenRouter*, *Ollama*)
- **Temporal anti-spoiler context filtering** (`00:00 -> playbackPositionMs`)

without spinning up the NestJS server or a live Supabase PostgreSQL instance.

`@wisp/ai-engine` achieves this through three pluggable contracts defined in [`ai-engine/src/types/index.ts`](../ai-engine/src/types/index.ts):
1. **`IContextSource`**: Supplies spoiler-safe context from either [`InMemoryCatalogContextSource`](../ai-engine/src/context/context-sources.ts) (standalone, zero DB) or [`HybridContextSource`](../ai-engine/src/context/context-sources.ts) (queries Supabase when online and falls back to in-memory automatically).
2. **`IAiModelAdapter`**: Standard `fetch`-based LLM adapters managed by [`AiProviderRouter`](../ai-engine/src/providers/provider-router.ts).
3. **`IAiFeatureModule`**: Self-contained feature classes managed by [`AiFeatureRegistry`](../ai-engine/src/features/feature-registry.ts).

---

## 2. Running Standalone (Zero Backend / Zero DB)

```bash
# Run the interactive CLI playground directly in Node 24
npm run ai:playground

# Run the standalone unit test suite (<5ms execution)
node --test ai-engine/src/engine.test.ts
```

---

## 3. Step-by-Step: Adding a New AI Feature

1. Create a new file in `ai-engine/src/features/my-new.feature.ts`:
   ```ts
   import { BaseAiFeatureModule } from './base.feature.ts';

   export class ThemeAnalysisFeature extends BaseAiFeatureModule {
     readonly actionType = 'theme_analysis';
     readonly description = 'Analyzes visual motifs and narrative themes in the active scene.';

     protected getFeatureSpecificInstructions(): string {
       return 'Task: Explain the visual motifs and symbolism in active_scene without spoiling future scenes.';
     }
   }
   ```
2. Register it in [`AiFeatureRegistry`](../ai-engine/src/features/feature-registry.ts) (or dynamically via `engine.registerFeature(new ThemeAnalysisFeature())`).
3. Both the standalone CLI (`ai-engine`), the NestJS backend (`POST /api/v1/wisp/query` and `GET /api/v1/wisp/features`), and the Fire TV client can immediately invoke `actionType: "theme_analysis"`.
