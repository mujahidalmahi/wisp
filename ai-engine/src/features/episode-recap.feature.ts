import { BaseAiFeatureModule } from './base.feature.ts';

export class EpisodeRecapFeature extends BaseAiFeatureModule {
  readonly actionType = 'episode_recap';
  readonly description =
    'Generates a spoiler-safe "Catch Me Up" summary up to the exact playback timestamp.';

  protected getFeatureSpecificInstructions(): string {
    return 'Task: Synthesize prior_scenes and recent_transcript into a chronological "Catch Me Up" recap ending strictly at playback_position_ms.';
  }
}
