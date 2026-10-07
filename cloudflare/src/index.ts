export interface Env {
  NESTJS_ORIGIN_URL: string;
  CACHE_TTL_SECONDS?: string;
  CORS_ALLOWED_ORIGINS?: string;
  WISP_CACHE?: KVNamespace;
  WISP_MEDIA_BUCKET?: R2Bucket;
}

export function resolveCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  const configured = env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000,http://10.0.2.2:3000,http://127.0.0.1:3000,http://localhost:8081';
  const allowed = configured.split(',').map((o) => o.trim()).filter(Boolean);

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Wisp-Device-Id, X-FireTV-Device-Id, X-Device-Id, X-Device-Token, X-CSRF-Token, X-Request-Id, X-Profile-Id, X-Operator-Token',
  };

  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Vary'] = 'Origin';
  }

  return headers;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const corsHeaders = resolveCorsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    // 1. Edge Health Check
    if (url.pathname === '/edge-health') {
      return Response.json(
        {
          status: 'ok',
          layer: 'cloudflare-edge-worker',
          origin: env.NESTJS_ORIGIN_URL,
          kvBound: Boolean(env.WISP_CACHE),
          r2Bound: Boolean(env.WISP_MEDIA_BUCKET),
        },
        { headers: corsHeaders },
      );
    }

    // 2. R2 Open-Movie Media Streaming (/media/*)
    if (url.pathname.startsWith('/media/') && env.WISP_MEDIA_BUCKET) {
      const objectKey = url.pathname.replace(/^\/media\//, '');
      const object = await env.WISP_MEDIA_BUCKET.get(objectKey);
      if (!object) {
        return new Response('Media asset not found', { status: 404, headers: corsHeaders });
      }
      const headers = new Headers(corsHeaders);
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('Accept-Ranges', 'bytes');
      return new Response(object.body, { headers });
    }

    // 3. Proxy & Edge-Cache Wisp API Requests (/api/v1/*)
    const originUrl = `${env.NESTJS_ORIGIN_URL.replace(/\/$/, '')}${url.pathname}${url.search}`;
    const ttl = parseInt(env.CACHE_TTL_SECONDS || '3600', 10);

    // Check KV cache for deterministic Wisp AI queries
    if (request.method === 'POST' && url.pathname.endsWith('/wisp/query') && env.WISP_CACHE) {
      const bodyClone = (await request.clone().json()) as Record<string, any>;
      const bucketSec = Math.floor((bodyClone.playbackPositionMs || 0) / 15000) * 15;
      const kvKey = `wisp:${bodyClone.episodeId}:${bucketSec}:${bodyClone.actionType}:${bodyClone.profileMode || 'quick_glance'}:${String(bodyClone.prompt || '').toLowerCase().trim()}`;

      const cachedJson = await env.WISP_CACHE.get(kvKey);
      if (cachedJson) {
        return new Response(cachedJson, {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'X-Wisp-Edge-Cache': 'HIT',
          },
        });
      }

      const forwardHeaders = new Headers(request.headers);
      forwardHeaders.set('Content-Type', 'application/json');

      const originResp = await fetch(originUrl, {
        method: 'POST',
        headers: forwardHeaders,
        body: JSON.stringify(bodyClone),
      });

      const responseText = await originResp.text();
      if (originResp.ok) {
        ctx.waitUntil(env.WISP_CACHE.put(kvKey, responseText, { expirationTtl: ttl }));
      }

      return new Response(responseText, {
        status: originResp.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'X-Wisp-Edge-Cache': 'MISS',
        },
      });
    }

    // Forward all other API requests to NestJS origin
    const upstreamResponse = await fetch(originUrl, {
      method: request.method,
      headers: request.headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });

    const responseHeaders = new Headers(upstreamResponse.headers);
    Object.entries(corsHeaders).forEach(([k, v]) => responseHeaders.set(k, v));

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  },
};
