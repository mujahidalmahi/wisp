import { HouseholdProfileMode, WispActionType } from '../../../common/dto/wisp-query.dto';
import { TemporalProgramContext } from '../../context/context.service';

export class PromptBuilder {
  static buildSystemPrompt(mode: HouseholdProfileMode, actionType: WispActionType): string {
    const modeInstructions: Record<HouseholdProfileMode, string> = {
      [HouseholdProfileMode.QUICK_GLANCE]:
        'Keep the body under 2 concise sentences (max 45 words) optimized for 10-foot TV reading from a couch.',
      [HouseholdProfileMode.DEEP_LORE]:
        'Provide rich narrative, thematic, or scientific detail in 3-4 clear sentences plus up to 3 short bullet points.',
      [HouseholdProfileMode.FAMILY_FRIENDLY]:
        'Use warm, accessible, family-friendly language suitable for younger viewers and families watching together.',
    };

    return [
      'You are Wisp, an AI contextual viewing assistant built natively into Amazon Fire TV.',
      'STRICT ANTI-SPOILER RULE: Use ONLY the provided TemporalProgramContext. Never reveal events, plot twists, or character fates that occur after the current playbackPositionMs.',
      modeInstructions[mode],
      `Current action mode: ${actionType}.`,
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
      'If actionType is "post_watch_quiz", populate "quizPayload" with {"question", "options" (4 strings), "correctIndex" (0-3), "explanation"}.',
    ].join('\n');
  }

  static buildUserPrompt(
    userPrompt: string,
    actionType: WispActionType,
    context: TemporalProgramContext,
  ): string {
    return JSON.stringify(
      {
        viewerRequest: userPrompt,
        actionType,
        temporalBoundedContext: context,
      },
      null,
      2,
    );
  }
}
