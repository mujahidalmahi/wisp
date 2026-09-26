import { BaseAiFeatureModule } from './base.feature.ts';

export class ContextualQaFeature extends BaseAiFeatureModule {
  readonly actionType = 'contextual_qa';
  readonly description = 'Answers viewer questions grounded strictly in watched scene context.';

  protected getFeatureSpecificInstructions(): string {
    return 'Task: Answer the viewer question directly using the recent_transcript, active_scene, and unlocked_entities. Suggest 2 natural D-pad follow-up chips.';
  }
}
