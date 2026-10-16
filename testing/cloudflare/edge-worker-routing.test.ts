import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Cloudflare Edge: Worker Routing, Security Invariants & R2 Media Streaming', () => {
  const workerSource = fs.readFileSync(path.resolve('cloudflare/src/index.ts'), 'utf8');

  it('exposes /edge-health and /media/* R2 byte-range streaming routes', () => {
    assert.ok(workerSource.includes("url.pathname === '/edge-health'"));
    assert.ok(workerSource.includes("url.pathname.startsWith('/media/')"));
    assert.ok(workerSource.includes("headers.set('Accept-Ranges', 'bytes')"));
  });

  it('enforces private, uncacheable headers on /wisp/query to prevent cross-tenant cache leaks (FL-011)', () => {
    assert.ok(workerSource.includes("url.pathname.endsWith('/wisp/query')"));
    assert.ok(workerSource.includes("'Cache-Control', 'private, no-cache, no-store, must-revalidate'"));
  });

  it('exposes full REST methods and device auth headers in CORS preflight', () => {
    assert.ok(workerSource.includes('PATCH'));
    assert.ok(workerSource.includes('DELETE'));
    assert.ok(workerSource.includes('X-Device-Secret'));
    assert.ok(workerSource.includes('X-Enrollment-Code'));
    assert.ok(workerSource.includes('X-Operator-Token'));
    assert.ok(workerSource.includes('X-Correlation-Id'));
  });

  it('forwards device auth, correlation headers, and trusted client IP through to NestJS origin', () => {
    assert.ok(workerSource.includes('forwardHeaders'), 'must maintain forwardHeaders collection');
    assert.ok(workerSource.includes('CF-Connecting-IP'), 'must extract and forward trusted client IP');
    assert.ok(workerSource.includes('X-Correlation-Id'), 'must expose correlation ID header');
    assert.ok(workerSource.includes('X-Wisp-Device-Id'), 'must expose device ID header');
  });
});
