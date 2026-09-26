# Wisp Cloudflare Edge Layer (Workers + KV + R2)

This workspace provides the optional **Cloudflare Edge Gateway** sitting between the **Fire TV client** and the **NestJS backend**, as well as edge delivery for public-domain/open-movie video streams stored in **Cloudflare R2**.

## Key Capabilities

1. **Edge Response Caching (Workers KV)**:
   - Caches deterministic `GET /api/v1/context/:episodeId` and `POST /api/v1/wisp/query` responses bucketed by `(episodeId, 15s_timestamp_bucket, actionType, profileMode)` at the edge (`<20ms` response time on Fire TV).
2. **Free-Tier Cost Protection & Rate Limiting**:
   - Shields the NestJS origin and AI provider quotas from burst traffic or accidental remote button mashing during judging.
3. **R2 Open-Movie Media Delivery (`/media/*`)**:
   - Serves MP4/HLS streams from Cloudflare R2 with zero egress fees and HTTP `Range` header support for instant scrubbing on Fire TV.
