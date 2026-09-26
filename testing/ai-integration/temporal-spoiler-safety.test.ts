import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WispAiEngine } from '../../ai-engine/src/engine.ts';

describe('AI Integration: Deterministic Temporal Anti-Spoiler Safety', () => {
  const episodeId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'; // Tears of Steel

  it('locks active scene to Scene 1 and hides Scene 2 transcript & Captain Barley at 00:35 (35,000ms)', async () => {
    const engine = WispAiEngine.createStandalone();
    const ctx = await engine.getInstantSceneContext(episodeId, 35000);

    assert.equal(ctx.active_scene.scene_index, 1);
    assert.equal(ctx.active_scene.scene_title, 'The Bridge Breakup (Memory Fragment)');
    assert.equal(ctx.prior_scenes.length, 1);

    // Transcript at 130,000ms (Barley in Scene 2) must NOT be included
    const hasFutureDialogue = ctx.recent_transcript.some((seg) => seg.end_time_ms > 35000);
    assert.equal(hasFutureDialogue, false, 'Future transcript lines leaked before playback head');

    // Captain Barley (revealTimeMs: 120001) must NOT be unlocked at 35,000ms
    const barley = ctx.unlocked_entities.find((e) => e.name === 'Captain Barley');
    assert.equal(barley, undefined, 'Future character revealed prematurely');
  });

  it('withholds Celia Scene 2 plot twist at 02:02 (122,000ms) before revealTimeMs (125,000ms)', async () => {
    const engine = WispAiEngine.createStandalone();
    const ctx = await engine.getInstantSceneContext(episodeId, 122000);

    // Scene 2 has started (120,001ms), so Barley is unlocked, but Celia's 125,000ms twist is still locked!
    assert.equal(ctx.active_scene.scene_index, 2);
    const celia = ctx.unlocked_entities.find((e) => e.name === 'Celia');
    assert.ok(celia);
    assert.equal(
      celia.progressive_fact,
      'Celia is an ambitious robotics engineer testing a cybernetic hand replacement.',
    );
  });

  it('unlocks Celia global machine network twist only at or after 02:05 (125,000ms)', async () => {
    const engine = WispAiEngine.createStandalone();
    const ctx = await engine.getInstantSceneContext(episodeId, 125000);

    const celia = ctx.unlocked_entities.find((e) => e.name === 'Celia');
    assert.ok(celia);
    assert.ok(celia.progressive_fact.includes('global machine network'));
  });

  it('clamps negative playback positions safely to 0ms without crashing', async () => {
    const engine = WispAiEngine.createStandalone();
    const ctx = await engine.getInstantSceneContext(episodeId, -5000);
    assert.equal(ctx.metadata.playback_position_ms, 0);
    assert.equal(ctx.active_scene.scene_index, 1);
  });
});
