import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WispAiEngine } from '../../ai-engine/src/engine.ts';
import { DeterministicTestAiAdapter } from '../helpers/mock-ai-adapter.ts';

describe('AI Integration: Multi-Provider Failover & 15-Second Timestamp Bucket Caching', () => {
  const episodeId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';

  it('automatically fails over from a failing primary provider to the secondary backup provider', async () => {
    const engine = WispAiEngine.createStandalone({ enableCache: false });

    const failingPrimary = new DeterministicTestAiAdapter({
      name: 'primary-groq-RateLimited',
      shouldFail: true,
    });
    const healthySecondary = new DeterministicTestAiAdapter({
      name: 'secondary-gemini-flash',
      shouldFail: false,
    });

    engine.registerModelAdapter(healthySecondary, 'first');
    engine.registerModelAdapter(failingPrimary, 'first');

    const card = await engine.execute({
      episodeId,
      playbackPositionMs: 50000,
      actionType: 'scene_explain',
      prompt: 'Why are they arguing?',
    });

    assert.equal(failingPrimary.callCount, 1);
    assert.equal(healthySecondary.callCount, 1);
    assert.equal(card.providerUsed, 'secondary-gemini-flash');
  });

  it('deduplicates and serves cached responses within the same 15-second playback bucket', async () => {
    const engine = WispAiEngine.createStandalone({ enableCache: true });
    const adapter = new DeterministicTestAiAdapter({ name: 'groq-cached-test' });
    engine.registerModelAdapter(adapter, 'first');

    // First call at 32,000ms (falls into 30s bucket: floor(32000 / 15000) * 15 = 30)
    const firstCard = await engine.execute({
      episodeId,
      playbackPositionMs: 32000,
      actionType: 'entity_explain',
      prompt: 'Who is Thom?',
      profileMode: 'quick_glance',
    });
    assert.equal(firstCard.cached, false);
    assert.equal(adapter.callCount, 1);

    // Second call 9 seconds later at 41,000ms (still in the 30s bucket!)
    const secondCard = await engine.execute({
      episodeId,
      playbackPositionMs: 41000,
      actionType: 'entity_explain',
      prompt: 'Who is Thom?',
      profileMode: 'quick_glance',
    });
    assert.equal(secondCard.cached, true);
    assert.equal(adapter.callCount, 1, 'LLM should not be called twice in the same 15s bucket');
  });
});
