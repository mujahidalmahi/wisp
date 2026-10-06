import type { ActionTypeResolver, IAiFeatureModule, WispActionType } from '../types/index.ts';
import { ContextualQaFeature } from './contextual-qa.feature.ts';
import { EntityExplainerFeature } from './entity-explainer.feature.ts';
import { SceneExplainerFeature } from './scene-explainer.feature.ts';
import { EpisodeRecapFeature } from './episode-recap.feature.ts';
import { InteractiveQuizFeature } from './interactive-quiz.feature.ts';

export class AiFeatureRegistry {
  private readonly features = new Map<WispActionType, IAiFeatureModule>();
  private readonly defaultFeature = new ContextualQaFeature();

  constructor() {
    this.register(this.defaultFeature);
    this.register(new EntityExplainerFeature());
    this.register(new SceneExplainerFeature());
    this.register(new EpisodeRecapFeature());
    this.register(new InteractiveQuizFeature());
  }

  register(feature: IAiFeatureModule): void {
    this.features.set(feature.actionType, feature);
  }

  resolve(actionType: WispActionType): IAiFeatureModule {
    return this.features.get(actionType) || this.defaultFeature;
  }

  canResolve(actionType: string): boolean {
    return this.features.has(actionType as WispActionType);
  }

  /**
   * Bound predicate for output validation. The registry owns the answer so chip
   * validation stays consistent with `resolve()` without importing it, which
   * would create a cycle.
   */
  asActionTypeResolver(): ActionTypeResolver {
    return (actionType: string) => this.canResolve(actionType);
  }

  /**
   * Action types the engine can dispatch right now. Prompt generation and output
   * validation both read this list so the model is never told about an action
   * the engine cannot honour, and never denied one it can.
   */
  listRegisteredActionTypes(): WispActionType[] {
    return Array.from(this.features.keys());
  }

  listRegisteredFeatures(): Array<{ actionType: WispActionType; description: string }> {
    return Array.from(this.features.values()).map((f) => ({
      actionType: f.actionType,
      description: f.description,
    }));
  }
}
