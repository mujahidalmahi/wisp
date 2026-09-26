import type {
  AiCompletionRequest,
  AiCompletionResult,
  IAiModelAdapter,
} from '../../ai-engine/src/types/index.ts';

/**
 * Deterministic AI Model Adapter for fast, repeatable automated tests.
 * Inspects the grounded prompt payload and returns schema-compliant JSON cards.
 */
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
