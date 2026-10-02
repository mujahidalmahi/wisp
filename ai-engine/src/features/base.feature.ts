import type {
  AiCompletionRequest,
  AiQueryInput,
  HouseholdProfileMode,
  IAiFeatureModule,
  TemporalProgramContext,
  WispActionType,
  WispResponseCard,
} from '../types/index.ts';

export abstract class BaseAiFeatureModule implements IAiFeatureModule {
  abstract readonly actionType: WispActionType;
  abstract readonly description: string;
  protected abstract getFeatureSpecificInstructions(): string;

  protected getModeInstructions(mode: HouseholdProfileMode): string {
    switch (mode) {
      case 'deep_lore':
        return 'Provide rich narrative, thematic, or scientific detail in 3-4 clear sentences plus up to 3 short bullet points.';
      case 'family_friendly':
        return 'Use warm, accessible, family-friendly language suitable for younger viewers and families watching together.';
      case 'quick_glance':
      default:
        return 'Keep the body under 2 concise sentences (max 45 words) optimized for 10-foot TV reading from a couch.';
    }
  }

  buildPrompts(
    input: AiQueryInput,
    context: TemporalProgramContext,
    profileMode: HouseholdProfileMode,
  ): AiCompletionRequest {
    const systemPrompt = [
      'You are Wisp, an AI contextual viewing assistant built natively into Amazon Fire TV.',
      'STRICT ANTI-SPOILER RULE: Use ONLY the provided TemporalProgramContext. Never reveal events, plot twists, or character fates that occur after the current playback_position_ms.',
      this.getModeInstructions(profileMode),
      this.getFeatureSpecificInstructions(),
      'Respond strictly with a valid JSON object matching this schema:',
      '{',
      '  "headline": "Short 3-7 word card title",',
      '  "body": "Clear distance-readable explanation",',
      '  "bulletPoints": ["Optional key takeaway 1", "Optional key takeaway 2"],',
      '  "followUpChips": [',
      '    {"id": "f1", "label": "Short follow-up question 1?", "actionType": "contextual_qa"},',
      '    {"id": "f2", "label": "Short follow-up question 2?", "actionType": "entity_explain"}',
      '  ],',
      '  "quizPayload": null',
      '}',
    ].join('\n');

    const userPrompt = JSON.stringify(
      {
        viewerRequest: input.prompt,
        actionType: this.actionType,
        temporalBoundedContext: context,
      },
      null,
      2,
    );

    return {
      systemPrompt,
      userPrompt,
      temperature: 0.3,
      maxTokens: 800,
    };
  }

  formatResponseCard(
    rawModelOutput: string,
    input: AiQueryInput,
    context: TemporalProgramContext,
    profileMode: HouseholdProfileMode,
    providerName: string,
    latencyMs: number,
  ): WispResponseCard {
    const parsed = this.parseJsonSafely(rawModelOutput);
    return {
      headline: parsed.headline || context.active_scene.scene_title,
      body: parsed.body || context.active_scene.spoiler_safe_summary,
      bulletPoints: Array.isArray(parsed.bulletPoints) ? parsed.bulletPoints : [],
      spoilerSafeUpToMs: input.playbackPositionMs,
      profileMode,
      providerUsed: providerName,
      cached: false,
      latencyMs,
      followUpChips:
        Array.isArray(parsed.followUpChips) && parsed.followUpChips.length > 0
          ? parsed.followUpChips
          : context.active_scene.quick_action_chips,
      quizPayload: parsed.quizPayload || undefined,
    };
  }

  protected parseJsonSafely(rawText: string): Partial<WispResponseCard> {
    try {
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      return JSON.parse(cleaned);
    } catch {
      try {
        const headlineMatch = rawText.match(/"headline"\s*:\s*"((?:\\.|[^"\\])*)"/);
        const bodyMatch = rawText.match(/"body"\s*:\s*"((?:\\.|[^"\\])*)"/);
        if (headlineMatch || bodyMatch) {
          const unescape = (str: string) => str.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          return {
            headline: headlineMatch ? unescape(headlineMatch[1]) : 'Contextual Insight',
            body: bodyMatch ? unescape(bodyMatch[1]) : rawText.trim(),
          };
        }
      } catch {}
      return {
        headline: 'Contextual Insight',
        body: rawText.trim(),
      };
    }
  }
}
