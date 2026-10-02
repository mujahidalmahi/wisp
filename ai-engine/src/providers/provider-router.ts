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
import {
  AiProviderCallerAbortError,
  AiProviderHttpError,
  AiProviderInternalAbortError,
  AiProviderTimeoutError,
  AiProvidersQuarantinedError,
  AiGlobalTimeoutError,
  composeAbortSignal,
  isAbortLikeError,
  unrefTimer,
} from './errors.ts';

const DEFAULT_PROVIDER_TIMEOUT_MS = 10000;
const DEFAULT_GLOBAL_TIMEOUT_MS = 15000;
const DEFAULT_MIN_ATTEMPT_MS = 3000;
const DEFAULT_PROVIDER_QUARANTINE_MS = 300000;

export class AiProviderRouter {
  private readonly adapters: IAiModelAdapter[] = [];
  private readonly defaultTimeoutMs: number;
  private readonly globalTimeoutMs: number;
  private readonly minAttemptMs: number;
  private readonly quarantineMs: number;
  private readonly quarantinedUntil = new Map<string, number>();

  constructor(config: WispAiEngineConfig = {}) {
    this.defaultTimeoutMs = config.providerTimeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
    this.globalTimeoutMs = config.globalTimeoutMs ?? DEFAULT_GLOBAL_TIMEOUT_MS;
    this.minAttemptMs = config.minAttemptMs ?? DEFAULT_MIN_ATTEMPT_MS;
    this.quarantineMs = config.providerQuarantineMs ?? DEFAULT_PROVIDER_QUARANTINE_MS;

    if (Array.isArray(config.adapters) && config.adapters.length > 0) {
      this.adapters = [...config.adapters];
    } else {
      this.adapters = [
        new GroqModelAdapter(config.groqApiKey, config.groqModel),
        new GeminiModelAdapter(config.geminiApiKey, config.geminiModel),
        new OpenRouterModelAdapter(config.openRouterApiKey, config.openRouterModel),
        new OllamaModelAdapter(config.ollamaBaseUrl, config.ollamaModel),
      ];
    }
  }

  registerAdapter(adapter: IAiModelAdapter, priority: 'first' | 'last' = 'last'): void {
    if (priority === 'first') {
      this.adapters.unshift(adapter);
    } else {
      this.adapters.push(adapter);
    }
  }

  private quarantineRemainingMs(adapter: IAiModelAdapter): number {
    const until = this.quarantinedUntil.get(adapter.name);
    if (until === undefined) {
      return 0;
    }
    const remaining = until - Date.now();
    return remaining < 0 ? 0 : remaining;
  }

  getConfiguredAdapters(): IAiModelAdapter[] {
    return this.adapters.filter((a) => a.isConfigured() && !this.isQuarantined(a));
  }

  /**
   * Quarantines a provider after a credential or model-not-found fault so later
   * requests skip it instead of paying the same failed round trip. Quarantine
   * expires so a rotated key recovers without a process restart.
   */
  private quarantine(adapter: IAiModelAdapter, durationMs?: number): void {
    this.quarantinedUntil.set(adapter.name, Date.now() + (durationMs ?? this.quarantineMs));
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
    if (request.signal?.aborted) {
      throw new AiProviderCallerAbortError('router', request.signal.reason);
    }

    const configured = this.adapters.filter((a) => a.isConfigured());
    if (configured.length === 0) {
      throw new Error(
        'No AI model adapters configured in @wisp/ai-engine. Provide groqApiKey, geminiApiKey, openRouterApiKey, or ollamaBaseUrl.',
      );
    }

    const active = configured.filter((a) => !this.isQuarantined(a));
    if (active.length === 0) {
      throw new AiProvidersQuarantinedError(
        configured.map((a) => ({ name: a.name, retryInMs: this.quarantineRemainingMs(a) })),
      );
    }

    const startedAt = Date.now();
    const globalTimeoutMs = request.globalTimeoutMs ?? request.timeoutMs ?? this.globalTimeoutMs;
    const minAttemptMs = request.minAttemptMs ?? this.minAttemptMs;
    const errors: string[] = [];
    // Recorded when an attempt begins rather than recovered from the formatted
    // failure strings, so a provider name that itself contains ':' survives.
    const attemptedProviders: string[] = [];

    for (const adapter of active) {
      if (request.signal?.aborted) {
        throw new AiProviderCallerAbortError('router', request.signal.reason);
      }

      const elapsed = Date.now() - startedAt;
      const remainingMs = globalTimeoutMs - elapsed;
      if (remainingMs < minAttemptMs) {
        throw new AiGlobalTimeoutError(globalTimeoutMs, attemptedProviders, errors);
      }

      const adapterBudget = adapter.timeoutMs ?? this.defaultTimeoutMs;
      const budgetMs = Math.min(adapterBudget, remainingMs);
      attemptedProviders.push(adapter.name);
      try {
        return await this.attemptWithinBudget(adapter, request, budgetMs);
      } catch (err: any) {
        if (err instanceof AiProviderCallerAbortError) {
          throw err;
        }
        if (err instanceof AiProviderHttpError && err.isConfigFault()) {
          this.quarantine(adapter, request.quarantineMs ?? undefined);
        }
        errors.push(this.describeFailure(adapter, budgetMs, err));
        const remainingAfterMs = globalTimeoutMs - (Date.now() - startedAt);
        if (remainingAfterMs < minAttemptMs) {
          throw new AiGlobalTimeoutError(globalTimeoutMs, attemptedProviders, errors);
        }
      }
    }

    throw new Error(`All configured AI providers failed -> ${errors.join(' | ')}`);
  }

  /**
   * Runs one adapter under a hard budget that genuinely cancels the underlying
   * work. A controller is aborted either by the caller's signal or by the
   * budget timer, and that combined signal is what the adapter receives, so a
   * cooperative adapter can terminate its own in-flight request.
   *
   * The race against a timer remains as a backstop for adapters that ignore the
   * signal entirely; those cannot be forced to stop, so bounding the wait is the
   * only lever available for them.
   */
  private async attemptWithinBudget(
    adapter: IAiModelAdapter,
    request: AiCompletionRequest,
    budgetMs: number,
  ): Promise<AiCompletionResult> {
    const callerSignal = request.signal;
    const timeoutError = new AiProviderTimeoutError(adapter.name, budgetMs);

    if (callerSignal?.aborted) {
      throw new AiProviderCallerAbortError(adapter.name, callerSignal.reason);
    }

    const controller = new AbortController();
    const abortForBudget = () => controller.abort(timeoutError);
    const budgetTimer = unrefTimer(setTimeout(abortForBudget, budgetMs));
    const onCallerAbort = () => controller.abort(callerSignal?.reason);
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

    const signal = composeAbortSignal(controller.signal, callerSignal);
    const deadline = new Promise<never>((_, reject) => {
      const rejectOnAbort = () => reject(controller.signal.reason ?? timeoutError);
      if (signal.aborted) {
        rejectOnAbort();
        return;
      }
      signal.addEventListener('abort', rejectOnAbort, { once: true });
    });

    try {
      return await Promise.race([adapter.complete({ ...request, signal }), deadline]);
    } catch (err) {
      if (err instanceof AiProviderTimeoutError) {
        throw err;
      }
      if (callerSignal?.aborted) {
        throw new AiProviderCallerAbortError(adapter.name, callerSignal.reason);
      }
      if (controller.signal.aborted && controller.signal.reason === timeoutError) {
        throw timeoutError;
      }
      if (isAbortLikeError(err)) {
        // The caller signal is not aborted, so this abort came from inside the
        // adapter (its own timeout, for example) and must not be misreported as
        // viewer cancellation.
        throw new AiProviderInternalAbortError(adapter.name, err);
      }
      throw err;
    } finally {
      clearTimeout(budgetTimer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    }
  }

  private describeFailure(adapter: IAiModelAdapter, budgetMs: number, err: unknown): string {
    if (err instanceof AiProviderTimeoutError) {
      return `${adapter.name}: timed out after ${budgetMs}ms`;
    }

    if (err instanceof AiProviderCallerAbortError) {
      return `${adapter.name}: cancelled by caller`;
    }

    if (err instanceof AiProviderInternalAbortError) {
      return `${adapter.name}: aborted internally`;
    }

    if (err instanceof AiProviderHttpError) {
      const kind = err.isConfigFault() ? 'config-fault' : err.isRetryable() ? 'retryable' : 'rejected';
      return `${adapter.name}: ${kind} HTTP ${err.status}`;
    }

    const message = (err as { message?: string } | null)?.message || String(err);
    return `${adapter.name}: ${message}`;
  }
}
