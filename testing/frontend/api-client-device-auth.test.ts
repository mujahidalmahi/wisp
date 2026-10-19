import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DeviceAuthService } from '../../frontend/src/services/device-auth.service.ts';
import { WispApiClient } from '../../frontend/src/services/api.client.ts';

describe('Frontend API Client & Device Authentication Security', () => {
  beforeEach(() => {
    DeviceAuthService.getInstance().setDeviceId('firetv-living-room-001');
  });

  it('manages Fire TV device identity and builds verified device headers', async () => {
    const authService = DeviceAuthService.getInstance();
    assert.equal(authService.getDeviceId(), 'firetv-living-room-001');

    const headers = await authService.getAuthHeaders();
    assert.equal(headers['Content-Type'], 'application/json');
    assert.equal(headers['X-Device-Id'], 'firetv-living-room-001');
    assert.equal(headers['X-FireTV-Device-Id'], 'firetv-living-room-001');
  });

  it('supports dynamic hardware device ID switching', async () => {
    const authService = DeviceAuthService.getInstance();
    authService.setDeviceId('firetv-bedroom-002');
    assert.equal(authService.getDeviceId(), 'firetv-bedroom-002');

    const headers = await authService.getAuthHeaders();
    assert.equal(headers['X-Device-Id'], 'firetv-bedroom-002');
    assert.equal(headers['X-FireTV-Device-Id'], 'firetv-bedroom-002');

    // Reset back
    authService.setDeviceId('firetv-living-room-001');
  });

  it('falls back seamlessly to @wisp/ai-engine in-memory context when backend is offline', async () => {
    // When backend is not running at 10.0.2.2:3000 during local testing, fetchInstantSceneContext
    // must not throw and must return valid spoiler-safe scene context up to the timestamp.
    const context = await WispApiClient.fetchInstantSceneContext(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      35000,
    );

    assert.ok(context, 'Context must be returned');
    assert.ok(context.active_scene, 'Active scene must be defined');
    assert.ok(context.active_scene.scene_title, 'Active scene title must exist');
    assert.ok(
      context.active_scene.quick_action_chips.length >= 2,
      'Must contain at least 2 D-pad quick action chips',
    );
  });

  it('falls back seamlessly to standalone @wisp/ai-engine execution on offline query', async () => {
    // Stage-2 query without running backend should route to local @wisp/ai-engine
    const card = await WispApiClient.queryWispAi({
      episodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      playbackPositionMs: 35000,
      actionType: 'scene_explain',
      prompt: 'What is happening in this scene?',
      profileMode: 'quick_glance',
    });

    assert.ok(card, 'AI response card must be returned');
    assert.ok(card.headline, 'Card must have headline');
    assert.ok(card.body, 'Card must have body');
    assert.ok(card.providerUsed, 'Provider used must be recorded');
    assert.ok(card.spoilerSafeUpToMs <= 35000, 'Must enforce spoiler safe playhead boundary');
  });

  it('handles vote interaction safely without throwing even if backend is offline', async () => {
    const success = await WispApiClient.voteInteraction('test-interaction-1', 1);
    // When offline, returns false without throwing unhandled exceptions
    assert.equal(typeof success, 'boolean');
  });

  it('returns demo programs catalog if remote backend catalog is unreachable', async () => {
    const programs = await WispApiClient.fetchPrograms();
    assert.ok(Array.isArray(programs));
    assert.ok(programs.length >= 3, 'Must contain at least 3 catalog programs');
    const titles = programs.map((p) => p.title);
    assert.ok(titles.includes('Tears of Steel'));
  });
});
