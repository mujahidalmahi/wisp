import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../cloudflare/src/index.ts';

type Env = {
  NESTJS_ORIGIN_URL: string;
  CACHE_TTL_SECONDS?: string;
  CORS_ALLOWED_ORIGINS?: string;
  WISP_CACHE?: any;
  WISP_MEDIA_BUCKET?: any;
};

describe('Cloudflare Edge: Worker Routing, Security Invariants & R2 Media Streaming', () => {
  const mockEnv: Env = {
    NESTJS_ORIGIN_URL: 'http://backend.internal:3000',
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://10.0.2.2:3000',
  };
  const mockCtx: any = {
    waitUntil: () => {},
    passThroughOnException: () => {},
  };

  it('serves /edge-health with status 200, origin, and layer headers via worker.fetch()', async () => {
    const request = new Request('http://edge.wisp.tv/edge-health', {
      method: 'GET',
    });
    const res = await worker.fetch(request, mockEnv, mockCtx);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.layer, 'cloudflare-edge-worker');
    assert.equal(data.origin, 'http://backend.internal:3000');
  });

  it('handles CORS OPTIONS preflight with allowed headers and methods via worker.fetch()', async () => {
    const request = new Request('http://edge.wisp.tv/api/v1/wisp/query', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3000',
      },
    });
    const res = await worker.fetch(request, mockEnv, mockCtx);
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000');
    assert.ok(res.headers.get('Access-Control-Allow-Methods')?.includes('POST'));
    assert.ok(res.headers.get('Access-Control-Allow-Methods')?.includes('PATCH'));
    assert.ok(res.headers.get('Access-Control-Allow-Headers')?.includes('X-Correlation-Id'));
    assert.ok(res.headers.get('Access-Control-Allow-Headers')?.includes('X-Device-Secret'));
  });

  it('serves media from R2 bucket with byte-range headers via worker.fetch()', async () => {
    const mockR2: any = {
      get: async (key: string) => {
        if (key === 'tears-of-steel.mp4') {
          return {
            body: new ReadableStream(),
            httpEtag: '"mock-etag-123"',
            writeHttpMetadata: (h: Headers) => {
              h.set('content-type', 'video/mp4');
            },
          };
        }
        return null;
      },
    };
    const envWithR2: Env = {
      ...mockEnv,
      WISP_MEDIA_BUCKET: mockR2,
    };

    // Valid asset
    const validReq = new Request('http://edge.wisp.tv/media/tears-of-steel.mp4');
    const validRes = await worker.fetch(validReq, envWithR2, mockCtx);
    assert.equal(validRes.status, 200);
    assert.equal(validRes.headers.get('Accept-Ranges'), 'bytes');
    assert.equal(validRes.headers.get('etag'), '"mock-etag-123"');

    // Missing asset -> 404
    const missingReq = new Request('http://edge.wisp.tv/media/missing.mp4');
    const missingRes = await worker.fetch(missingReq, envWithR2, mockCtx);
    assert.equal(missingRes.status, 404);
  });

  it('forwards trusted client IP and sets private uncacheable header on /wisp/query via worker.fetch()', async () => {
    let capturedUrl = '';
    let capturedHeaders: Headers | null = null;

    // Mock global fetch for upstream proxy test
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ headline: 'Upstream Answer' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': 'req-123',
        },
      });
    };

    try {
      const request = new Request('http://edge.wisp.tv/api/v1/wisp/query?episodeId=ep1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'http://localhost:3000',
          'CF-Connecting-IP': '203.0.113.195',
          'X-Correlation-Id': 'corr-abc-123',
          'X-Wisp-Device-Id': 'dev-firetv-777',
        },
        body: JSON.stringify({ prompt: 'Who is this?' }),
      });

      const res = await worker.fetch(request, mockEnv, mockCtx);
      assert.equal(res.status, 200);
      assert.equal(capturedUrl, 'http://backend.internal:3000/api/v1/wisp/query?episodeId=ep1');
      assert.equal(capturedHeaders?.get('CF-Connecting-IP'), '203.0.113.195');
      assert.equal(capturedHeaders?.get('X-Correlation-Id'), 'corr-abc-123');
      assert.equal(capturedHeaders?.get('X-Wisp-Device-Id'), 'dev-firetv-777');
      assert.equal(
        res.headers.get('Cache-Control'),
        'private, no-cache, no-store, must-revalidate',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
