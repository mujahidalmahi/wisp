import type {
  AiCompletionRequest,
  AiCompletionResult,
  IAiModelAdapter,
  WispAiEngineConfig,
} from '../types/index.ts';
import { GroqModelAdapter } from './groq.adapter.ts';
import { GeminiModelAdapter } from './gemini.adapter.ts';
import { OpenRouterModelAdapter } from './openrouter.adapter.ts';
import { OllamaModelAdapter } from './ollama.adapter.ts';

export class AiProviderRouter {
  private readonly adapters: IAiModelAdapter[] = [];

  constructor(config: WispAiEngineConfig = {}) {
    this.adapters = [
      new GroqModelAdapter(config.groqApiKey, config.groqModel),
      new GeminiModelAdapter(config.geminiApiKey, config.geminiModel),
      new OpenRouterModelAdapter(config.openRouterApiKey, config.openRouterModel),
      new OllamaModelAdapter(config.ollamaBaseUrl, config.ollamaModel),
    ];
  }

  registerAdapter(adapter: IAiModelAdapter, priority: 'first' | 'last' = 'last'): void {
    if (priority === 'first') {
      this.adapters.unshift(adapter);
    } else {
      this.adapters.push(adapter);
    }
  }

  getConfiguredAdapters(): IAiModelAdapter[] {
    return this.adapters.filter((a) => a.isConfigured());
  }

  async completeWithFallback(request: AiCompletionRequest): Promise<AiCompletionResult> {
    const active = this.getConfiguredAdapters();
    if (active.length === 0) {
      throw new Error(
        'No AI model adapters configured in @wisp/ai-engine. Provide groqApiKey, geminiApiKey, openRouterApiKey, or ollamaBaseUrl.',
      );
    }

    const errors: string[] = [];
    for (const adapter of active) {
      try {
        return await adapter.complete(request);
      } catch (err: any) {
        errors.push(`${adapter.name}: ${err?.message || err}`);
      }
    }

    throw new Error(`All configured AI providers failed -> ${errors.join(' | ')}`);
  }
}
