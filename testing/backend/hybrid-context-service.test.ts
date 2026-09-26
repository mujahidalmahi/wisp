import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HybridContextSource,
  InMemoryCatalogContextSource,
} from '../../ai-engine/src/context/context-sources.ts';

describe('Backend: HybridContextSource DB Primary vs Standalone Fallback Resilience', () => {
  const episodeId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';

  it('uses primary database RPC result when Supabase is online and returns valid data', async () => {
    let dbCalled = false;
    const hybrid = new HybridContextSource(async (epId, posMs) => {
      dbCalled = true;
      return {
        metadata: {
          program_title: 'Supabase Live Program',
          genre: 'Sci-Fi',
          episode_title: 'Live DB Episode',
          season_number: 1,
          episode_number: 1,
          playback_position_ms: posMs,
        },
        active_scene: {
          scene_index: 1,
          scene_title: 'Database Scene',
          location_name: 'Amsterdam',
          spoiler_safe_summary: 'From live Supabase RPC',
          quick_action_chips: [],
        },
        prior_scenes: [],
        recent_transcript: [],
        unlocked_entities: [],
      };
    });

    const ctx = await hybrid.getSpoilerSafeContext(episodeId, 50000);
    assert.equal(dbCalled, true);
    assert.equal(ctx.metadata.program_title, 'Supabase Live Program');
  });

  it('gracefully falls back to standalone InMemoryCatalogContextSource if Supabase throws or is offline', async () => {
    const hybrid = new HybridContextSource(async () => {
      throw new Error('Supabase connection timeout');
    }, new InMemoryCatalogContextSource());

    const ctx = await hybrid.getSpoilerSafeContext(episodeId, 135000);
    assert.equal(ctx.metadata.program_title, 'Tears of Steel');
    assert.equal(ctx.active_scene.scene_title, 'Inside the Oude Kerk Dome');
  });
});
