import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WispAiEngine } from '../../ai-engine/src/engine.ts';
import { DeterministicTestAiAdapter } from '../helpers/mock-ai-adapter.ts';

describe('Full Application E2E: Complete Viewer Journey Across Scenes, Modes & Quiz', () => {
  const tearsOfSteelEpisodeId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
  const documentaryEpisodeId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2';

  it('completes a full multi-step viewing session from Scene 1 -> Scene 2 -> Mode Switch -> Post-Watch Quiz', async () => {
    const engine = WispAiEngine.createStandalone({ enableCache: true });
    const adapter = new DeterministicTestAiAdapter({ name: 'groq:llama-3.3-70b-versatile' });
    engine.registerModelAdapter(adapter, 'first');

    // Step 1: Viewer invokes Wisp at 00:35 (35,000ms) in Scene 1
    const stage1Scene1 = await engine.getInstantSceneContext(tearsOfSteelEpisodeId, 35000);
    assert.equal(stage1Scene1.active_scene.scene_title, 'The Bridge Breakup (Memory Fragment)');
    const firstChip = stage1Scene1.active_scene.quick_action_chips[0];
    assert.ok(firstChip);

    // Step 2: Viewer clicks the first Quick Action Chip ("Who are Thom and Celia?")
    const card1 = await engine.execute({
      episodeId: tearsOfSteelEpisodeId,
      playbackPositionMs: 35000,
      actionType: firstChip.actionType,
      prompt: firstChip.label,
      profileMode: 'quick_glance',
    });
    assert.equal(card1.spoilerSafeUpToMs, 35000);
    assert.equal(card1.profileMode, 'quick_glance');
    assert.ok(card1.followUpChips.length >= 2);

    // Step 3: Viewer scrubs forward to 02:25 (145,000ms, Scene 2) and switches to Deep Lore mode
    const stage1Scene2 = await engine.getInstantSceneContext(tearsOfSteelEpisodeId, 145000);
    assert.equal(stage1Scene2.active_scene.scene_title, 'Inside the Oude Kerk Dome');

    const card2 = await engine.execute({
      episodeId: tearsOfSteelEpisodeId,
      playbackPositionMs: 145000,
      actionType: 'episode_recap',
      prompt: 'Catch me up to this moment',
      profileMode: 'deep_lore',
    });
    assert.equal(card2.profileMode, 'deep_lore');
    assert.equal(card2.spoilerSafeUpToMs, 145000);

    // Step 4: Viewer switches to Science Documentary and triggers a Post-Watch Quiz
    const quizCard = await engine.execute({
      episodeId: documentaryEpisodeId,
      playbackPositionMs: 180000,
      actionType: 'post_watch_quiz',
      prompt: 'Test my knowledge on this clip',
      profileMode: 'family_friendly',
    });
    assert.ok(quizCard.quizPayload);
    assert.equal(quizCard.quizPayload.options.length, 4);
    assert.equal(quizCard.quizPayload.correctIndex, 0);
  });
});
