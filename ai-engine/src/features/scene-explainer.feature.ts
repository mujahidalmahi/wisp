import { BaseAiFeatureModule } from './base.feature.ts';

export class SceneExplainerFeature extends BaseAiFeatureModule {
  readonly actionType = 'scene_explain';
  readonly description = 'Explains what just happened in the current scene and character motives.';

  protected getFeatureSpecificInstructions(): string {
    return 'Task: Explain the events, subtext, and visual cues of the active_scene and recent_transcript so the viewer understands why this moment matters.';
  }
}
