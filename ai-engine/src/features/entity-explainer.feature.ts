import { BaseAiFeatureModule } from './base.feature.ts';

export class EntityExplainerFeature extends BaseAiFeatureModule {
  readonly actionType = 'entity_explain';
  readonly description =
    'Explains characters, locations, objects, or scientific terms without spoiling future twists.';

  protected getFeatureSpecificInstructions(): string {
    return 'Task: Provide a concise identity & role breakdown for the requested character, location, concept, or object using ONLY unlocked_entities and active_scene.';
  }
}
