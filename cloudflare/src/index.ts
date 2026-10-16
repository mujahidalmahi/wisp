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

    // 3. Proxy Wisp API Requests (/api/v1/*)
    // To strictly prevent tenant isolation breaches and cross-device cache pollution (Blockers 1 & 2),
    // authenticated AI queries are never edge-cached with client-controlled identifiers.
    // Instead, all queries are forwarded upstream where NestJS + Supabase enforce cryptographic
    // token verification, profile device ownership, and 15-second temporal database caching.
    const originUrl = `${env.NESTJS_ORIGIN_URL.replace(/\/$/, '')}${url.pathname}${url.search}`;

    const forwardHeaders = new Headers(request.headers);
    // Explicitly emit client IP header only from trusted edge boundary
    const cfConnectingIp = request.headers.get('CF-Connecting-IP');
    if (cfConnectingIp) {
      forwardHeaders.set('CF-Connecting-IP', cfConnectingIp);
    }

    const upstreamResponse = await fetch(originUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    });

    const responseHeaders = new Headers(upstreamResponse.headers);
    Object.entries(corsHeaders).forEach(([k, v]) => responseHeaders.set(k, v));

    // Ensure user-specific AI query responses are marked private and uncacheable by intermediate proxies
    if (url.pathname.endsWith('/wisp/query') || url.pathname.includes('/sessions')) {
      responseHeaders.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  },
};
