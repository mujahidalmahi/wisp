import type {
  ActionTypeResolver,
  AiCompletionRequest,
  AiQueryInput,
  HouseholdProfileMode,
  IAiFeatureModule,
  TemporalProgramContext,
  WispActionType,
  WispResponseCard,
} from '../types/index.ts';
import {
  BUILT_IN_ACTION_TYPES,
  validateChips,
  validateQuizPayload,
} from './output-validation.ts';

export abstract class BaseAiFeatureModule implements IAiFeatureModule {
  abstract readonly actionType: WispActionType;
  abstract readonly description: string;
  protected abstract getFeatureSpecificInstructions(): string;

  /** Fields repaired on the most recent card. Useful for engine metrics and tests. */
  protected repairCount = 0;

  getLastRepairCount(): number {
    return this.repairCount;
  }

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
    availableActionTypes: WispActionType[] = [],
  ): AiCompletionRequest {
    const permittedActionTypes = availableActionTypes.length
      ? availableActionTypes
      : BUILT_IN_ACTION_TYPES;
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
      '',
      `HARD CONSTRAINTS - violating any of these makes the card invalid:`,
      `- "followUpChips" must contain between 2 and 4 entries. "actionType" must be exactly one of: ${permittedActionTypes.join(', ')}.`,
      `- Chip labels must be non-empty strings of at most 80 characters, and each "id" must be unique.`,
      `- "quizPayload" must be null, or an object with a non-empty "question", exactly 4 non-empty "options", an "explanation", and an integer "correctIndex` + '` between 0 and 3 inclusive.',
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
      maxTokens: 450,
    };
  }

  formatResponseCard(
    rawModelOutput: string,
    input: AiQueryInput,
    context: TemporalProgramContext,
    profileMode: HouseholdProfileMode,
    providerName: string,
    latencyMs: number,
    canResolveActionType?: ActionTypeResolver,
  ): WispResponseCard {
    const parsed = this.parseJsonSafely(rawModelOutput);

    const chipResult = validateChips(parsed.followUpChips, context.active_scene.quick_action_chips, {
      canResolveActionType,
    });
    const quizResult = validateQuizPayload(parsed.quizPayload);
    this.repairCount = chipResult.droppedChips + chipResult.truncatedChips + chipResult.coercedActionTypes;

    return {
      headline: parsed.headline || context.active_scene.scene_title,
      body: parsed.body || context.active_scene.spoiler_safe_summary,
      bulletPoints: Array.isArray(parsed.bulletPoints)
        ? parsed.bulletPoints.filter((point): point is string => typeof point === 'string')
        : [],
      spoilerSafeUpToMs: input.playbackPositionMs,
      profileMode,
      providerUsed: providerName,
      cached: false,
      latencyMs,
      followUpChips: chipResult.chips,
      quizPayload: quizResult.quizPayload,
    };
  }

  protected parseJsonSafely(rawText: string): Partial<WispResponseCard> {
    const cleaned = stripJsonFences(rawText || '');
    try {
      return JSON.parse(cleaned);
    } catch {
      const headlineMatch = cleaned.match(/"headline"\s*:\s*"((?:\\.|[^"\\])*)"/);
      const bodyMatch = cleaned.match(/"body"\s*:\s*"((?:\\.|[^"\\])*)"/);

      if (headlineMatch || bodyMatch) {
        return {
          headline: headlineMatch ? unescapeJsonString(headlineMatch[1]) : 'Contextual Insight',
          body: bodyMatch ? unescapeJsonString(bodyMatch[1]) : cleaned,
        };
      }

      return {
        headline: 'Contextual Insight',
        body: cleaned,
      };
    }
  }
}

/**
 * Removes an optional ```json wrapper and its closing fence. The closing fence
 * is matched with trailing whitespace permitted, because models routinely emit
 * a newline or two after it and a fence that survives stripping turns a valid
 * payload into an unparseable one.
 */
function stripJsonFences(rawText: string): string {
  return rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

/**
 * Resolves the escape sequences a model can emit inside a headline or body. The
 * values recovered here come from a regex over unparseable text, so they are
 * still JSON-escaped and must be decoded before they are rendered on the card.
 */
function unescapeJsonString(value: string): string {
  return value.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}
