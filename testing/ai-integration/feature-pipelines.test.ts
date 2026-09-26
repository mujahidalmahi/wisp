import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WispAiEngine } from '../../ai-engine/src/engine.ts';
import { BaseAiFeatureModule } from '../../ai-engine/src/features/base.feature.ts';
import { DeterministicTestAiAdapter } from '../helpers/mock-ai-adapter.ts';

class CinematographyBreakdownFeature extends BaseAiFeatureModule {
  readonly actionType = 'cinematography_breakdown';
  readonly description = 'Explains camera lenses, lighting, and VFX compositing in the active scene.';

  protected getFeatureSpecificInstructions(): string {
    return 'Task: Analyze the VFX compositing and lighting cues in active_scene.';
  }
}

describe('AI Integration: Feature Pipelines & Household Modes', () => {
  const episodeId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';

  it('executes all 5 built-in AI features (Q&A, Entity, Scene, Recap, Quiz) with grounded context', async () => {
    const engine = WispAiEngine.createStandalone({ enableCache: false });
    const adapter = new DeterministicTestAiAdapter();
    engine.registerModelAdapter(adapter, 'first');

    const actionTypes = [
      'contextual_qa',
      'entity_explain',
      'scene_explain',
      'episode_recap',
      'post_watch_quiz',
    ] as const;

    for (const actionType of actionTypes) {
      const card = await engine.execute({
        episodeId,
        playbackPositionMs: 145000,
        actionType,
        prompt: `Test prompt for ${actionType}`,
        profileMode: 'quick_glance',
      });

      assert.ok(card.headline.includes(`[${actionType}]`));
      assert.equal(card.spoilerSafeUpToMs, 145000);
      assert.ok(card.followUpChips.length >= 2);

      if (actionType === 'post_watch_quiz') {
        assert.ok(card.quizPayload, 'Quiz feature must populate quizPayload');
        assert.equal(card.quizPayload.options.length, 4);
      }
    }
  });

  it('adapts system prompt instructions across all 3 Household Viewing Modes', async () => {
    const engine = WispAiEngine.createStandalone({ enableCache: false });
    const adapter = new DeterministicTestAiAdapter();
    engine.registerModelAdapter(adapter, 'first');

    await engine.execute({
      episodeId,
      playbackPositionMs: 40000,
      actionType: 'contextual_qa',
      prompt: 'What is happening?',
      profileMode: 'quick_glance',
    });
    assert.ok(adapter.lastRequest?.systemPrompt.includes('max 45 words'));

    await engine.execute({
      episodeId,
      playbackPositionMs: 40000,
      actionType: 'contextual_qa',
      prompt: 'What is happening?',
      profileMode: 'deep_lore',
    });
    assert.ok(adapter.lastRequest?.systemPrompt.includes('rich narrative, thematic, or scientific detail'));

    await engine.execute({
      episodeId,
      playbackPositionMs: 40000,
      actionType: 'contextual_qa',
      prompt: 'What is happening?',
      profileMode: 'family_friendly',
    });
    assert.ok(adapter.lastRequest?.systemPrompt.includes('family-friendly language'));
  });

  it('registers and executes custom AI features without backend or database changes', async () => {
    const engine = WispAiEngine.createStandalone();
    engine.registerModelAdapter(new DeterministicTestAiAdapter(), 'first');
    engine.registerFeature(new CinematographyBreakdownFeature());

    const registered = engine.listFeatures();
    assert.ok(registered.some((f) => f.actionType === 'cinematography_breakdown'));

    const card = await engine.execute({
      episodeId,
      playbackPositionMs: 140000,
      actionType: 'cinematography_breakdown',
      prompt: 'How were the green hologram grids composited?',
    });

    assert.ok(card.headline.includes('[cinematography_breakdown]'));
  });
});
