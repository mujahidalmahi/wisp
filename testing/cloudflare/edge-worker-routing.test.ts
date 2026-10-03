import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Cloudflare Edge: Worker KV Cache Key Bucketing & R2 Media Streaming', () => {
  const workerSource = fs.readFileSync(path.resolve(repositoryRoot, 'cloudflare/src/index.ts'), 'utf8');

  it('exposes /edge-health and /media/* R2 byte-range streaming routes', () => {
    assert.ok(workerSource.includes("url.pathname === '/edge-health'"));
    assert.ok(workerSource.includes("url.pathname.startsWith('/media/')"));
    assert.ok(workerSource.includes("headers.set('Accept-Ranges', 'bytes')"));
  });

  it('computes 15-second KV cache buckets for POST /wisp/query requests', () => {
    assert.ok(
      workerSource.includes('Math.floor((bodyClone.playbackPositionMs || 0) / 15000) * 15'),
    );
    assert.ok(workerSource.includes("'X-Wisp-Edge-Cache': 'HIT'"));
    assert.ok(workerSource.includes("'X-Wisp-Edge-Cache': 'MISS'"));
  });
});
