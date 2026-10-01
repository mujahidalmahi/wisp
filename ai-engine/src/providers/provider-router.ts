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
import { AiProviderHttpError, AiProviderTimeoutError, isAbortLikeError } from './errors.ts';

const DEFAULT_PROVIDER_TIMEOUT_MS = 10000;
const DEFAULT_PROVIDER_QUARANTINE_MS = 300000;

export class AiProviderRouter {
  private readonly adapters: IAiModelAdapter[] = [];
  private readonly defaultTimeoutMs: number;
  private readonly quarantineMs: number;
  private readonly quarantinedUntil = new Map<string, number>();

  constructor(config: WispAiEngineConfig = {}) {
    this.defaultTimeoutMs = config.providerTimeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
    this.quarantineMs = config.providerQuarantineMs ?? DEFAULT_PROVIDER_QUARANTINE_MS;
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
    return this.adapters.filter((a) => a.isConfigured() && !this.isQuarantined(a));
  }

  /**
   * Quarantines a provider after a credential or model-not-found fault so later
   * requests skip it instead of paying the same failed round trip. Quarantine
   * expires so a rotated key recovers without a process restart.
   */
  private quarantine(adapter: IAiModelAdapter): void {
    this.quarantinedUntil.set(adapter.name, Date.now() + this.quarantineMs);
  }

  private isQuarantined(adapter: IAiModelAdapter): boolean {
    const until = this.quarantinedUntil.get(adapter.name);
    if (until === undefined) {
      return false;
    }
    if (Date.now() >= until) {
      this.quarantinedUntil.delete(adapter.name);
      return false;
    }
    return true;
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
      const budgetMs = adapter.timeoutMs ?? this.defaultTimeoutMs;
      try {
        return await this.attemptWithinBudget(adapter, request, budgetMs);
      } catch (err: any) {
        if (err instanceof AiProviderHttpError && err.isConfigFault()) {
          this.quarantine(adapter);
        }
        errors.push(this.describeFailure(adapter, budgetMs, err));
      }
    }

    throw new Error(`All configured AI providers failed -> ${errors.join(' | ')}`);
  }

  private async attemptWithinBudget(
    adapter: IAiModelAdapter,
    request: AiCompletionRequest,
    budgetMs: number,
  ): Promise<AiCompletionResult> {
    const signal = AbortSignal.timeout(budgetMs);
    let timer: ReturnType<typeof setTimeout> | undefined;

    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AiProviderTimeoutError(adapter.name, budgetMs)), budgetMs);
    });

    try {
      return await Promise.race([adapter.complete({ ...request, signal }), deadline]);
    } catch (err) {
      if (err instanceof AiProviderTimeoutError) {
        throw err;
      }
      if (isAbortLikeError(err)) {
        throw new AiProviderTimeoutError(adapter.name, budgetMs);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private describeFailure(adapter: IAiModelAdapter, budgetMs: number, err: unknown): string {
    if (err instanceof AiProviderTimeoutError) {
      return `${adapter.name}: timed out after ${budgetMs}ms`;
    }

    if (err instanceof AiProviderHttpError) {
      const kind = err.isConfigFault() ? 'config-fault' : err.isRetryable() ? 'retryable' : 'rejected';
      return `${adapter.name}: ${kind} HTTP ${err.status}`;
    }

    const message = (err as { message?: string } | null)?.message || String(err);
    return `${adapter.name}: ${message}`;
  }
}
