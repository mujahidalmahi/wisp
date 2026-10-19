import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Full Application: Live NestJS HTTP API & Real AI Gateway Verification', () => {
  const baseUrl = 'http://127.0.0.1:3000/api/v1';
  const episodeId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';

  async function isServerOnline(): Promise<boolean> {
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(1500) });
      return res.ok;
    } catch {
      return false;
    }
  }

  it('verifies GET /health endpoint returns HTTP 200 with ok status', async (t) => {
    if (!(await isServerOnline())) {
      t.skip('NestJS local server is not running on port 3000');
      return;
    }

    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'wisp-backend');
  });

  it('verifies GET /wisp/features lists all 5 core Wisp AI feature modules', async (t) => {
    if (!(await isServerOnline())) {
      t.skip('NestJS local server is not running on port 3000');
      return;
    }

    const res = await fetch(`${baseUrl}/wisp/features`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.features));
    const types = body.features.map((f: any) => f.actionType);
    assert.ok(types.includes('contextual_qa'));
    assert.ok(types.includes('entity_explain'));
    assert.ok(types.includes('scene_explain'));
    assert.ok(types.includes('episode_recap'));
    assert.ok(types.includes('post_watch_quiz'));
  });

  it('verifies GET /context/:episodeId returns spoiler-safe scene and quick action chips', async (t) => {
    if (!(await isServerOnline())) {
      t.skip('NestJS local server is not running on port 3000');
      return;
    }

    const res = await fetch(`${baseUrl}/context/${episodeId}?playbackMs=35000`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.metadata.program_title, 'Tears of Steel');
    assert.equal(body.active_scene.scene_title, 'The Bridge Breakup (Memory Fragment)');
    assert.ok(body.active_scene.quick_action_chips.length >= 3);
  });

  it('verifies POST /wisp/query executes real AI inference and returns grounded WispResponseCard', async (t) => {
    if (!(await isServerOnline())) {
      t.skip('NestJS local server is not running on port 3000');
      return;
    }

    const res = await fetch(`${baseUrl}/wisp/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        episodeId,
        playbackPositionMs: 35000,
        actionType: 'scene_explain',
        prompt: 'Why are they arguing on the bridge?',
        profileMode: 'quick_glance',
      }),
    });

    assert.equal(res.status, 201);
    const card = await res.json();
    assert.ok(card.headline.length > 0);
    assert.ok(card.body.length > 10);
    assert.ok(card.providerUsed.length > 0);
    assert.ok(card.latencyMs >= 0);
    assert.ok(Array.isArray(card.followUpChips));
  });

  it('verifies 15-second playback timestamp bucketing serves cached response with low latency', async (t) => {
    if (!(await isServerOnline())) {
      t.skip('NestJS local server is not running on port 3000');
      return;
    }

    // Identical prompt within same 15s bucket (35,000ms -> bucket 30,000ms)
    const res = await fetch(`${baseUrl}/wisp/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        episodeId,
        playbackPositionMs: 37000,
        actionType: 'scene_explain',
        prompt: 'Why are they arguing on the bridge?',
        profileMode: 'quick_glance',
      }),
    });

    assert.equal(res.status, 201);
    const card = await res.json();
    assert.equal(card.cached, true);
    assert.ok(card.latencyMs <= 50, `Cached latency must be <= 50ms, received ${card.latencyMs}`);
  });
});
