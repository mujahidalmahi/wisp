import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Cloudflare Edge: Worker KV Cache Key Bucketing & R2 Media Streaming', () => {
  const workerSource = fs.readFileSync(path.resolve('cloudflare/src/index.ts'), 'utf8');

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

  it('exposes full REST methods and device auth headers in CORS preflight', () => {
    assert.ok(workerSource.includes('PATCH'));
    assert.ok(workerSource.includes('DELETE'));
    assert.ok(workerSource.includes('X-Device-Secret'));
    assert.ok(workerSource.includes('X-Enrollment-Code'));
    assert.ok(workerSource.includes('X-Operator-Token'));
  });

  it('forwards device auth and correlation headers through POST /wisp/query edge cache path', () => {
    assert.ok(workerSource.includes("'authorization'"), 'must forward authorization header');
    assert.ok(workerSource.includes("'x-wisp-device-id'"), 'must forward x-wisp-device-id header');
    assert.ok(workerSource.includes("'x-device-secret'"), 'must forward x-device-secret header');
    assert.ok(workerSource.includes("'x-request-id'"), 'must forward x-request-id header');
    assert.ok(workerSource.includes("'x-correlation-id'"), 'must forward x-correlation-id header');
    assert.ok(workerSource.includes('request.headers.get(name)'), 'must iterate and extract headers');
  });
});

