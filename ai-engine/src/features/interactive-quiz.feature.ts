import { BaseAiFeatureModule } from './base.feature.ts';

export class InteractiveQuizFeature extends BaseAiFeatureModule {
  readonly actionType = 'post_watch_quiz';
  readonly description =
    'Generates a 4-option interactive trivia question grounded in scenes watched so far.';

  protected getFeatureSpecificInstructions(): string {
    return [
      'Task: Create a fun, grounded 4-option trivia question based ONLY on watched scenes in prior_scenes and recent_transcript.',
      'Populate "quizPayload" with {"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "..."}.',
    ].join('\n');
  }
}
