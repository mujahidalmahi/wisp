import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EnvConfig } from '../../frontend/src/config/env.ts';
import { InMemoryCatalogContextSource } from '../../ai-engine/src/context/context-sources.ts';

describe('Frontend: Fire TV Emulator Networking & Offline Context Fallback', () => {
  it('configures Android/Fire OS host loopback alias (10.0.2.2) per FL-001 friction log', () => {
    assert.ok(
      EnvConfig.apiBaseUrl.includes('10.0.2.2:3000/api/v1'),
      'Fire TV emulator must route via 10.0.2.2 host loopback',
    );
  });

  it('resolves Stage-1 Instant Scene Context and Quick Action Chips locally when backend is unreachable', async () => {
    const fallback = new InMemoryCatalogContextSource();
    const ctx = await fallback.getSpoilerSafeContext(EnvConfig.defaultEpisodeId, 35000);

    assert.equal(ctx.metadata.program_title, 'Tears of Steel');
    assert.ok(ctx.active_scene.quick_action_chips.length >= 3);
  });
});
