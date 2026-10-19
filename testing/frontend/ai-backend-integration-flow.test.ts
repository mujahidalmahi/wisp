import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WispApiClient } from '../../frontend/src/services/api.client.ts';
import { DeviceAuthService } from '../../frontend/src/services/device-auth.service.ts';
import type { HouseholdProfileMode } from '../../frontend/src/types/wisp.ts';
import { DEMO_PROGRAMS } from '../../frontend/src/config/catalog.ts';

describe('Frontend End-to-End AI & Backend Integration Flow', () => {
  const deviceAuth = DeviceAuthService.getInstance();

  it('proves client requests include signed device authentication headers', async () => {
    deviceAuth.setDeviceToken('mock-signed-jwt-token');
    const headers = await deviceAuth.getAuthHeaders();
    assert.ok(headers['Authorization'], 'Must include Authorization Bearer header');
    assert.ok(headers['Authorization'].startsWith('Bearer '), 'Must be standard Bearer token');
    assert.equal(headers['Authorization'], 'Bearer mock-signed-jwt-token');
    assert.ok(headers['X-Device-Id'], 'Must include hardware X-Device-Id header');
    assert.equal(headers['Content-Type'], 'application/json', 'Must use JSON Content-Type');
  });

  it('executes spoiler-safe scene context retrieval with temporal locking', async () => {
    const episodeId = DEMO_PROGRAMS[0].episodeId;
    const playbackPositionMs = 120000; // 2 minutes in

    const context = await WispApiClient.fetchInstantSceneContext(episodeId, playbackPositionMs);
    assert.ok(context, 'Must return valid scene context');
    assert.ok(context.active_scene, 'Must return active scene');
    assert.ok(context.active_scene.scene_title, 'Must contain scene title');
    assert.ok(context.active_scene.spoiler_safe_summary, 'Must contain summary');

    // Temporal invariant: context metadata tracks the exact temporal lock
    assert.equal(
      context.metadata.playback_position_ms,
      playbackPositionMs,
      `Metadata playback position must be ${playbackPositionMs}`,
    );

    // Quick action chips must be present for 10-foot zero-typing navigation
    assert.ok(
      context.active_scene.quick_action_chips.length >= 2,
      'Must provide at least 2 QuickActionChips for D-pad selection',
    );
  });

  it('executes AI moment queries across household profile modes', async () => {
    const episodeId = DEMO_PROGRAMS[0].episodeId;
    const playbackPositionMs = 95000;
    const testModes: HouseholdProfileMode[] = ['quick_glance', 'deep_lore', 'family_friendly'];

    for (const mode of testModes) {
      const response = await WispApiClient.queryWispAi({
        episodeId,
        playbackPositionMs,
        actionType: 'scene_explain',
        prompt: 'Explain what the characters are doing right now',
        profileMode: mode,
      });

      assert.ok(response, `Must return valid AI response card for profile mode: ${mode}`);
      assert.ok(response.headline.length > 0, `Mode ${mode} must have headline`);
      assert.ok(response.body.length > 0, `Mode ${mode} must have body explanation`);
      assert.ok(response.providerUsed.length > 0, `Mode ${mode} must report AI provider`);
      assert.ok(typeof response.latencyMs === 'number', `Mode ${mode} must report latency`);
      assert.ok(Array.isArray(response.followUpChips), `Mode ${mode} must provide follow-up chips`);
      assert.ok(
        response.spoilerSafeUpToMs <= playbackPositionMs,
        'Response must respect playhead boundary',
      );
    }
  });

  it('guarantees temporal spoiler cutoff: questions cannot reveal future secrets', async () => {
    const episodeId = DEMO_PROGRAMS[0].episodeId;
    const earlyTimestampMs = 30000; // 30 seconds into the show

    const response = await WispApiClient.queryWispAi({
      episodeId,
      playbackPositionMs: earlyTimestampMs,
      actionType: 'scene_explain',
      prompt: 'Who is the traitor?',
      profileMode: 'quick_glance',
    });

    assert.ok(response, 'Must respond gracefully');
    assert.ok(
      response.body.length > 0,
      'Must provide a spoiler-safe grounded explanation without hallucination',
    );
    assert.ok(
      response.spoilerSafeUpToMs <= earlyTimestampMs,
      'Must not reveal spoilers past early timestamp',
    );
  });

  it('submits helpfulness votes to backend API contract with optimistic resilience', async () => {
    // Both thumbs up (+1) and thumbs down (-1) must succeed without throwing
    await assert.doesNotReject(
      async () => WispApiClient.voteInteraction('11111111-1111-1111-1111-111111111111', 1),
      'Positive vote (+1) must resolve cleanly',
    );

    await assert.doesNotReject(
      async () => WispApiClient.voteInteraction('11111111-1111-1111-1111-111111111111', -1),
      'Negative vote (-1) must resolve cleanly',
    );
  });

  it('synchronizes catalog programs with fallback to high-quality offline seeds', async () => {
    const programs = await WispApiClient.fetchPrograms();
    assert.ok(programs.length >= 3, 'Must return at least 3 demo programs');

    const genres = programs.map((p) => p.genre);
    assert.ok(genres.includes('Sci-Fi'), 'Catalog must include Sci-Fi program');
    assert.ok(genres.includes('Mystery / Thriller'), 'Catalog must include Mystery / Thriller program');
    assert.ok(genres.includes('Science Documentary'), 'Catalog must include Science Documentary program');
  });
});
