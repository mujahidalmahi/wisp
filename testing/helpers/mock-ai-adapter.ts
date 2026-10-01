import type {
  AiCompletionRequest,
  AiCompletionResult,
  IAiModelAdapter,
} from '../../ai-engine/src/types/index.ts';
import { AiProviderHttpError } from '../../ai-engine/src/providers/errors.ts';

/**
 * Deterministic AI Model Adapter for fast, repeatable automated tests.
 * Inspects the grounded prompt payload and returns schema-compliant JSON cards.
 */
/**
 * Simulates a provider that accepts the request but never responds in time.
 * `respectSignal: false` models an adapter that ignores the injected
 * AbortSignal, proving the router's own deadline still bounds the attempt.
 */
export class HangingTestAiAdapter implements IAiModelAdapter {
  readonly name: string;
  readonly timeoutMs?: number;
  public callCount = 0;
  public sawSignal = false;
  public observedAbort = false;
  private readonly hangForMs: number;
  private readonly respectSignal: boolean;

  constructor(options?: {
    name?: string;
    timeoutMs?: number;
    hangForMs?: number;
    respectSignal?: boolean;
  }) {
    this.name = options?.name || 'hanging-test-ai';
    this.timeoutMs = options?.timeoutMs;
    this.hangForMs = options?.hangForMs || 30000;
    this.respectSignal = options?.respectSignal ?? true;
  }

  isConfigured(): boolean {
    return true;
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    this.callCount += 1;

    if (req.signal) {
      this.sawSignal = true;
      if (this.respectSignal) {
        req.signal.addEventListener(
          'abort',
          () => {
            this.observedAbort = true;
          },
          { once: true },
        );
      }
    }

    await new Promise((resolve) => setTimeout(resolve, this.hangForMs));

    return {
      providerName: this.name,
      latencyMs: this.hangForMs,
      rawText: JSON.stringify({ headline: 'unreachable', body: '', bulletPoints: [], followUpChips: [] }),
    };
  }
}

/**
 * Fails with a credential fault for the first `failCalls` attempts, then succeeds.
 * Models a key that is rotated or re-provisioned after an initial 401.
 */
export class RecoveringAuthTestAiAdapter implements IAiModelAdapter {
  readonly name: string;
  public callCount = 0;
  private readonly failStatus: number;
  private readonly failCalls: number;

  constructor(options?: { name?: string; failStatus?: number; failCalls?: number }) {
    this.name = options?.name || 'recovering-auth-test-ai';
    this.failStatus = options?.failStatus || 401;
    this.failCalls = options?.failCalls ?? 1;
  }

  isConfigured(): boolean {
    return true;
  }

  async complete(): Promise<AiCompletionResult> {
    this.callCount += 1;
    if (this.callCount <= this.failCalls) {
      throw new AiProviderHttpError(this.name, this.failStatus, '{"detail":"expired or invalid key"}');
    }
    return {
      providerName: this.name,
      latencyMs: 9,
      rawText: JSON.stringify({
        headline: 'Recovered Card',
        body: 'The provider answered after its credentials were fixed.',
        bulletPoints: [],
        followUpChips: [
          { id: 'f1', label: 'Follow up one?', actionType: 'contextual_qa' },
          { id: 'f2', label: 'Follow up two?', actionType: 'entity_explain' },
        ],
      }),
    };
  }
}

/**
 * Always throws the given HTTP status, for exercising router failure classification.
 */
export class FailingHttpTestAiAdapter implements IAiModelAdapter {
  readonly name: string;
  readonly timeoutMs?: number;
  public callCount = 0;
  private readonly status: number;

  constructor(options?: { name?: string; status?: number; timeoutMs?: number }) {
    this.name = options?.name || 'failing-http-test-ai';
    this.status = options?.status || 500;
    this.timeoutMs = options?.timeoutMs;
  }

  isConfigured(): boolean {
    return true;
  }

  async complete(): Promise<AiCompletionResult> {
    this.callCount += 1;
    throw new AiProviderHttpError(this.name, this.status, '{"detail":"simulated upstream failure"}');
  }
}

export class DeterministicTestAiAdapter implements IAiModelAdapter {
  readonly name: string;
  private readonly shouldFail: boolean;
  private readonly simulatedLatencyMs: number;
  public callCount = 0;
  public lastRequest: AiCompletionRequest | null = null;

  constructor(options?: { name?: string; shouldFail?: boolean; simulatedLatencyMs?: number }) {
    this.name = options?.name || 'deterministic-test-ai';
    this.shouldFail = options?.shouldFail || false;
    this.simulatedLatencyMs = options?.simulatedLatencyMs || 8;
  }

  isConfigured(): boolean {
    return true;
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    this.callCount += 1;
    this.lastRequest = req;

    if (this.shouldFail) {
      throw new Error(`${this.name} simulated provider rate-limit or network error`);
    }

    const parsedUser = JSON.parse(req.userPrompt);
    const sceneTitle =
      parsedUser.temporalBoundedContext?.active_scene?.scene_title || 'Unknown Scene';
    const actionType = parsedUser.actionType;

    const isQuiz = actionType === 'post_watch_quiz';

    return {
      providerName: this.name,
      latencyMs: this.simulatedLatencyMs,
      rawText: JSON.stringify({
        headline: `[${actionType}] ${sceneTitle}`,
        body: `Grounded explanation for "${parsedUser.viewerRequest}" in ${sceneTitle}.`,
        bulletPoints: [
          `Spoiler-safe up to ${parsedUser.temporalBoundedContext?.metadata?.playback_position_ms}ms`,
          `Unlocked entities count: ${parsedUser.temporalBoundedContext?.unlocked_entities?.length ?? 0}`,
        ],
        followUpChips: [
          {
            id: 'followup-1',
            label: `Tell me more about ${sceneTitle}`,
            actionType: 'scene_explain',
          },
          {
            id: 'followup-2',
            label: 'Catch me up so far',
            actionType: 'episode_recap',
          },
        ],
        quizPayload: isQuiz
          ? {
              question: `What is the primary setting of "${sceneTitle}"?`,
              options: [
                parsedUser.temporalBoundedContext?.active_scene?.location_name || 'Amsterdam',
                'Lunar Base Alpha',
                'Submarine Nautilus',
                'Sahara Outpost',
              ],
              correctIndex: 0,
              explanation: `The scene takes place at ${parsedUser.temporalBoundedContext?.active_scene?.location_name}.`,
            }
          : null,
      }),
    };
  }
}
