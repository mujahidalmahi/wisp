import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WispAiEngine } from './engine.ts';
import { BaseAiFeatureModule } from './features/base.feature.ts';
import type { AiCompletionRequest, AiCompletionResult, IAiModelAdapter } from './types/index.ts';

class EchoJsonModelAdapter implements IAiModelAdapter {
  readonly name = 'echo-test-adapter';

  isConfigured(): boolean {
    return true;
  }

  async complete(req: AiCompletionRequest): Promise<AiCompletionResult> {
    const parsedUser = JSON.parse(req.userPrompt);
    return {
      providerName: this.name,
      latencyMs: 12,
      rawText: JSON.stringify({
        headline: `Insight for ${parsedUser.temporalBoundedContext.active_scene.scene_title}`,
        body: `Verified grounded answer for: ${parsedUser.viewerRequest}`,
        bulletPoints: ['Spoiler-safe check passed'],
        followUpChips: [
          { id: 'next-1', label: 'What happens next?', actionType: 'contextual_qa' },
        ],
      }),
    };
  }
}

class CustomDirectorCommentaryFeature extends BaseAiFeatureModule {
  readonly actionType = 'director_commentary';
  readonly description = 'Provides behind-the-scenes cinematography & VFX notes.';

  protected getFeatureSpecificInstructions(): string {
    return 'Task: Explain the VFX and camera staging of the active scene.';
  }
}

describe('@wisp/ai-engine standalone modular execution', () => {
  it('enforces deterministic anti-spoiler temporal filtering without a database', async () => {
    const engine = WispAiEngine.createStandalone();
    const epId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';

    const earlyContext = await engine.getInstantSceneContext(epId, 40000);
    assert.equal(earlyContext.active_scene.scene_index, 1);
    assert.equal(earlyContext.unlocked_entities.length, 2); // Barley not revealed yet!
    const earlyCelia = earlyContext.unlocked_entities.find((e) => e.name === 'Celia');
    assert.ok(!earlyCelia?.progressive_fact.includes('global machine network'));

    const lateContext = await engine.getInstantSceneContext(epId, 140000);
    assert.equal(lateContext.active_scene.scene_index, 2);
    assert.equal(lateContext.unlocked_entities.length, 3); // Barley unlocked
    const lateCelia = lateContext.unlocked_entities.find((e) => e.name === 'Celia');
    assert.ok(lateCelia?.progressive_fact.includes('global machine network'));
  });

  it('allows registering custom AI features and model adapters independently of backend/DB', async () => {
    const engine = WispAiEngine.createStandalone();
    engine.registerModelAdapter(new EchoJsonModelAdapter(), 'first');
    engine.registerFeature(new CustomDirectorCommentaryFeature());

    const card = await engine.execute({
      episodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      playbackPositionMs: 140000,
      actionType: 'director_commentary',
      prompt: 'How was the Oude Kerk hologram shot?',
      profileMode: 'deep_lore',
    });

    assert.equal(card.headline, 'Insight for Inside the Oude Kerk Dome');
    assert.equal(card.providerUsed, 'echo-test-adapter');
    assert.equal(card.spoilerSafeUpToMs, 140000);
    assert.equal(card.cached, false);
  });
});
