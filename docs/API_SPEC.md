# Wisp REST & Programmatic API Specification

**Wisp — AI-Powered Contextual Viewing for Amazon Fire TV**
*Document Version:* `1.0.0-production`
*Target Environments:* NestJS 10+ (`backend/`), Cloudflare Workers (`cloudflare/`), `@wisp/ai-engine` (`ai-engine/`), Supabase PostgreSQL 15+ (`supabase/`)

---

## 1. Overview & Protocol Architecture

The Wisp API architecture is partitioned into three complementary interfaces:
1. **Application REST API (`backend/`):** High-throughput, typed NestJS HTTP gateway serving the Fire TV 10-foot client, managing device enrollment, catalog pagination, Stage-1 scene context bootstrap, household viewing profiles, and Stage-2 grounded AI queries.
2. **Modular Programmatic SDK (`@wisp/ai-engine`):** Framework-agnostic TypeScript package that executes contextual feature pipelines and temporal filtering standalone (zero NestJS or database dependency required).
3. **Database RPC Gateway (`supabase/`):** Hardened PostgreSQL `SECURITY DEFINER` stored procedures enforcing mathematical anti-spoiler gates, pure-SQL hybrid RRF search, and device-isolated data storage.

### 1.1 Base URLs

| Environment | Base URL | Routing & Target |
| :--- | :--- | :--- |
| **Local Development / Fire OS Emulator** | `http://10.0.2.2:3000/api/v1` | Android Emulator loopback routing to local NestJS backend. |
| **Local Physical Fire TV Device** | `http://<LAN_IP>:3000/api/v1` | Local Wi-Fi network address of developer host. |
| **Cloudflare Edge Gateway** | `https://wisp-edge.your-subdomain.workers.dev/api/v1` | Cloudflare Worker fronting 15-second timestamp bucket cache. |
| **Production Application API** | `https://api.wisp.tv/api/v1` | Production load balancer fronting NestJS cluster. |
| **Supabase Direct PostgREST RPC** | `https://<project-ref>.supabase.co/rest/v1/rpc` | Direct database RPC endpoint (for service-role / edge). |

### 1.2 Protocol Headers & Security Model

Wisp employs a zero-trust hardware device isolation model. Every Fire TV device is identified by a unique `deviceId`:

* **`Authorization: Bearer <device_jwt_token>`:** Signed JWT containing `device_id` in app claims, issued via `/api/v1/auth/enroll` or `/api/v1/auth/device-token`.
* **`x-device-id: <deviceId>`:** Hardware fallback header accepted in non-production local development when JWT verification is disabled.
* **`x-operator-token: <operatorToken>`:** Shared operator credential required for administrative diagnostics (`/health/readiness`) and device provisioning (`/auth/pre-authorize`, `/auth/revoke`, `/auth/rotate-secret`).
* **`X-Wisp-Temporal-Floor-Ms: <playbackMs>`:** Standard response header emitted on all context endpoints certifying the mathematical spoiler floor applied to the returned payload.

---

## 2. Authentication & Device Management API (`AuthController`)

### 2.1 Enroll Device
`POST /api/v1/auth/enroll`

Dedicated enrollment endpoint for initial Fire TV device provisioning. Requires either a single-use pre-authorized `enrollmentCode` or authenticated operator credentials to prevent unauthorized device ID registration.

#### Request Headers
* `Content-Type: application/json`
* `x-enrollment-code: <code_string>` *(Optional if provided in body)*
* `x-operator-token: <token>` *(Optional operator bypass)*

#### Request Body (`IssueDeviceTokenDto`)
```json
{
  "deviceId": "firetv-living-room-001",
  "enrollmentCode": "ENROLL-8X49-2026",
  "enrollmentKey": "optional-hardware-entropy-key"
}
```

#### Response `200 OK`
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": 86400,
  "deviceId": "firetv-living-room-001",
  "deviceSecret": "sec_live_9f83a4b2c1d0e8f7...",
  "status": "enrolled"
}
```

---

### 2.2 Issue / Renew Device Token
`POST /api/v1/auth/device-token`

Renews an active device token or re-authenticates an already enrolled device using the `deviceSecret` issued during initial provisioning.

#### Request Body (`IssueDeviceTokenDto`)
```json
{
  "deviceId": "firetv-living-room-001",
  "deviceSecret": "sec_live_9f83a4b2c1d0e8f7..."
}
```

#### Response `200 OK`
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": 86400,
  "deviceId": "firetv-living-room-001"
}
```

---

### 2.3 Operator: Pre-Authorize Device
`POST /api/v1/auth/pre-authorize`

Generates a time-bounded single-use challenge code enabling a specific Fire TV device to self-enroll.

#### Request Headers
* `x-operator-token: <OPERATOR_TOKEN>` *(Required)*

#### Request Body (`PreAuthorizeDeviceDto`)
```json
{
  "deviceId": "firetv-bedroom-002",
  "expiresInSeconds": 900
}
```

#### Response `200 OK`
```json
{
  "deviceId": "firetv-bedroom-002",
  "enrollmentCode": "ENROLL-7K21-2026",
  "expiresAt": "2026-10-19T02:45:00.000Z"
}
```

---

### 2.4 Operator: Revoke Device
`POST /api/v1/auth/revoke`

Revokes all active credentials and blacklist tokens for a specified hardware device.

#### Request Headers
* `x-operator-token: <OPERATOR_TOKEN>` *(Required)*

#### Request Body (`RevokeDeviceDto`)
```json
{
  "deviceId": "firetv-bedroom-002",
  "reason": "Hardware replacement"
}
```

#### Response `200 OK`
```json
{
  "success": true,
  "deviceId": "firetv-bedroom-002",
  "status": "revoked"
}
```

---

### 2.5 Operator: Rotate Device Secret
`POST /api/v1/auth/rotate-secret`

Rotates the secret generation epoch for a device, invalidating any previously issued client secrets.

#### Request Headers
* `x-operator-token: <OPERATOR_TOKEN>` *(Required)*

#### Request Body (`PreAuthorizeDeviceDto`)
```json
{
  "deviceId": "firetv-living-room-001"
}
```

#### Response `200 OK`
```json
{
  "success": true,
  "deviceId": "firetv-living-room-001",
  "newEpoch": 2
}
```

---

## 3. System Health & Observability API (`HealthController`)

### 3.1 Minimal Liveness Probe
`GET /api/v1/health`

Public endpoint intended for Kubernetes / Cloudflare health monitors and load balancers. Returns `200 OK` immediately without issuing database roundtrips.

#### Response `200 OK`
```json
{
  "status": "ok",
  "service": "wisp-backend",
  "timestamp": "2026-10-19T02:30:00.000Z"
}
```

---

### 3.2 Operational Readiness Probe
`GET /api/v1/health/readiness`

Dual-path readiness check:
* **Public / Anonymous Path:** Returns lightweight service status based on configuration without executing database roundtrips (prevents denial-of-service database exhaustion).
* **Internal / Operator Path (Authenticated via `x-operator-token` or `Authorization: Bearer <operatorToken>`):** Executes active database health check via `SupabaseService.checkHealth()` and returns comprehensive diagnostics.

#### Public Response `200 OK`
```json
{
  "status": "ok",
  "service": "wisp-backend",
  "timestamp": "2026-10-19T02:30:00.000Z",
  "database": "connected"
}
```

#### Authenticated Operator Response `200 OK`
```json
{
  "status": "ok",
  "service": "wisp-backend",
  "timestamp": "2026-10-19T02:30:00.000Z",
  "database": {
    "status": "ok",
    "latencyMs": 14,
    "version": "PostgreSQL 15.6 on x86_64-pc-linux-gnu"
  }
}
```

---

## 4. Context & Anti-Spoiler Viewing API (`ContextController`)

All context endpoints are guarded by `DeviceAuthGuard` and validate that callers possess a verified hardware identity.

### 4.1 Stage-1 Instant Scene Context Lookup
`GET /api/v1/context/:episodeId?playbackMs=135000&lookbackMs=120000`

Returns the active narrative scene, unlocked lore entities, dialogue within the lookback window, and 2–4 D-pad Quick Action Chips in `<50ms`.

#### Route Parameters
* `episodeId` (`UUID v4`): Target playable media asset ID.

#### Query Parameters (`GetContextQueryDto`)
* `playbackMs` (`INTEGER`, default `0`, range `0` to `86400000`): Current playback position in milliseconds.
* `lookbackMs` (`INTEGER`, default `120000`, range `0` to `3600000`): Milliseconds of recent dialogue to retrieve before playback head.

#### Response `200 OK`
```json
{
  "found": true,
  "metadata": {
    "program_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
    "program_title": "Tears of Steel",
    "episode_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
    "episode_title": "The Amsterdam Recalibration",
    "duration_ms": 734000,
    "playback_ms": 135000,
    "progress_pct": 18.39
  },
  "active_scene": {
    "scene_index": 2,
    "scene_title": "The Memory Projection Begins",
    "location_name": "Oude Kerk Church",
    "mood_tag": "tense",
    "narrative_tension_score": 7,
    "start_time_ms": 120000,
    "end_time_ms": 240000,
    "summary": "Barley initiates the holographic rig; Thom is placed into the memory.",
    "quick_action_chips": [
      {
        "id": "c1",
        "label": "Why the bridge memory?",
        "actionType": "scene_explain"
      },
      {
        "id": "c2",
        "label": "Who is Barley?",
        "actionType": "entity_explain"
      },
      {
        "id": "c3",
        "label": "Recap so far",
        "actionType": "episode_recap"
      }
    ]
  },
  "prior_scenes": [
    {
      "scene_index": 1,
      "scene_title": "Amsterdam Neural Projection",
      "start_time_ms": 0,
      "end_time_ms": 120000,
      "summary": "Barley prepares the neural memory rig inside the Oude Kerk."
    }
  ],
  "recent_transcript": [
    {
      "start_time_ms": 125000,
      "end_time_ms": 131000,
      "speaker": "BARLEY",
      "dialogue": "Hold your positions! We need this rig online now!",
      "visual_cue": "Barley adjusts power coupling",
      "is_key_plot_point": false
    }
  ],
  "unlocked_entities": [
    {
      "slug": "thom",
      "name": "Thom",
      "type": "character",
      "base_description": "Former lover of Celia undergoing memory reconstruction.",
      "progressive_fact": "Barley straps Thom into the neural rig.",
      "is_plot_twist": false,
      "importance_rank": 1,
      "in_current_scene": true
    }
  ],
  "unlocked_relationships": [
    {
      "source_entity": "Thom",
      "target_entity": "Celia",
      "relationship_type": "former_lovers",
      "summary": "Broke up 40 years ago before the robot war."
    }
  ]
}
```

---

### 4.2 Stage-1 Single-Roundtrip Fire TV Bootstrap
`GET /api/v1/context/:episodeId/bootstrap?playbackMs=135000&profileId=11111111-1111-1111-1111-111111111111`

High-performance single-roundtrip endpoint designed specifically for the 10-foot Fire TV overlay drawer. In $<50\text{ms}$, delivers the active household viewing profile, active scene context, D-pad action chips, strictly verified pre-warmed bucket cache cards, and multi-turn session state.

#### Query Parameters (`GetBootstrapQueryDto`)
* `playbackMs` (`INTEGER`, default `0`): Current playback position in milliseconds.
* `profileId` (`UUID`, optional): Preferred household profile to select if multiple exist on the device.

#### Response `200 OK`
```json
{
  "found": true,
  "episode_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
  "playback_position_ms": 135000,
  "time_bucket_sec": 135,
  "profile": {
    "id": "11111111-1111-1111-1111-111111111111",
    "display_name": "Living Room TV",
    "mode": "quick_glance",
    "spoiler_strictness": "strict",
    "voice_tts_enabled": true
  },
  "active_scene": {
    "scene_index": 2,
    "scene_title": "The Memory Projection Begins",
    "location_name": "Oude Kerk Church",
    "mood_tag": "tense",
    "narrative_tension_score": 7,
    "spoiler_safe_summary": "Barley initiates the holographic rig; Thom is placed into the memory.",
    "quick_action_chips": [
      {
        "id": "c1",
        "label": "Why the bridge memory?",
        "actionType": "scene_explain"
      },
      {
        "id": "c2",
        "label": "Who is Barley?",
        "actionType": "entity_explain"
      }
    ]
  },
  "prewarmed_cards": [
    {
      "action_type": "scene_explain",
      "profile_mode": "quick_glance",
      "card": {
        "headline": "The Memory Projection",
        "body": "Commander Barley is projecting Thom into a holographic recreation of his breakup with Celia.",
        "spoilerSafeUpToMs": 135000
      }
    }
  ],
  "session": {
    "session_id": "99999999-9999-9999-9999-999999999999",
    "turn_count": 0,
    "recent_turns": [],
    "bookmarked_moments": []
  }
}
```

---

## 5. AI Gateway API (`AiGatewayController`)

### 5.1 List Registered AI Features
`GET /api/v1/wisp/features`

Returns all modular AI feature pipelines currently registered in `@wisp/ai-engine`.

#### Response `200 OK`
```json
{
  "features": [
    {
      "actionType": "contextual_qa",
      "description": "Answers viewer questions grounded strictly in watched scene context."
    },
    {
      "actionType": "entity_explain",
      "description": "Explains characters, locations, objects, or scientific terms without spoiling future twists."
    },
    {
      "actionType": "scene_explain",
      "description": "Explains what just happened in the current scene and character motives."
    },
    {
      "actionType": "episode_recap",
      "description": "Generates a spoiler-safe \"Catch Me Up\" summary up to the exact playback timestamp."
    },
    {
      "actionType": "post_watch_quiz",
      "description": "Generates a 4-option interactive trivia question grounded in scenes watched so far."
    }
  ]
}
```

---

### 5.2 Stage-2 Grounded AI Query
`POST /api/v1/wisp/query`

Executes full-path grounded AI generation. Routes through multi-provider router (`Groq` $\rightarrow$ `Gemini` $\rightarrow$ `OpenRouter` $\rightarrow$ `Ollama`), enforced by the 15-second timestamp bucket cache.

#### Request Body (`WispQueryRequestDto`)
```json
{
  "episodeId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
  "playbackPositionMs": 135000,
  "actionType": "scene_explain",
  "prompt": "Why are they recreating the bridge memory?",
  "profileMode": "quick_glance",
  "profileId": "11111111-1111-1111-1111-111111111111"
}
```

#### Response `200 OK` (`WispResponseCardDto`)
```json
{
  "headline": "The Bridge Memory Reenactment",
  "body": "Resistance Commander Barley is projecting Thom into a holographic recreation of his breakup with Celia 40 years ago, hoping to resolve the emotional trauma driving the machine offensive.",
  "bulletPoints": [
    "Set inside the fortified Oude Kerk in Amsterdam",
    "Perimeter defenses are holding back the approaching robot horde"
  ],
  "spoilerSafeUpToMs": 135000,
  "profileMode": "quick_glance",
  "providerUsed": "groq:llama-3.3-70b-versatile",
  "cached": false,
  "latencyMs": 380,
  "followUpChips": [
    {
      "id": "f1",
      "label": "Who is Captain Barley?",
      "actionType": "entity_explain"
    },
    {
      "id": "f2",
      "label": "What happened on the bridge 40 years ago?",
      "actionType": "episode_recap"
    }
  ]
}
```

---

## 6. Catalog Browsing API (`CatalogController`)

### 6.1 List Programs with Keyset Pagination
`GET /api/v1/catalog/programs?genre=Sci-Fi&q=Tears&limit=20&order=asc&cursor=<cursor>`

Returns actively published catalog programs using SQL-level typed cursor pagination.

#### Query Parameters (`GetProgramsQueryDto`)
* `genre` (`STRING`, optional): Case-insensitive genre filter.
* `q` (`STRING`, optional): Keyword search matching `title` or `synopsis`.
* `limit` (`INTEGER`, default `20`, range `1` to `100`): Page size.
* `cursor` (`STRING`, optional): Composite cursor token `title::id`.
* `order` (`STRING`, default `asc`): Sort direction (`asc` or `desc`).

#### Response `200 OK`
```json
{
  "items": [
    {
      "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
      "slug": "tears-of-steel",
      "title": "Tears of Steel",
      "genre": "Sci-Fi",
      "synopsis": "In a dystopian Amsterdam, human resistance fighters barricaded in a church attempt to save the earth from a robot horde.",
      "release_year": 2012,
      "rating": "TV-14",
      "poster_url": "https://cdn.wisp.tv/posters/tears-of-steel.jpg",
      "backdrop_url": "https://cdn.wisp.tv/backdrops/tears-of-steel.jpg",
      "license_info": "CC-BY Blender Foundation",
      "is_active": true
    }
  ],
  "nextCursor": "Tears of Steel::aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
  "hasMore": false
}
```

---

### 6.2 Get Program by Slug
`GET /api/v1/catalog/programs/:slug`

#### Route Parameters
* `slug` (`STRING`): Kebab-case program slug validated by `ParseSlugPipe` (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`).

#### Response `200 OK`
```json
{
  "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
  "slug": "tears-of-steel",
  "title": "Tears of Steel",
  "genre": "Sci-Fi",
  "synopsis": "In a dystopian Amsterdam, human resistance fighters barricaded in a church attempt to save the earth from a robot horde.",
  "release_year": 2012,
  "rating": "TV-14",
  "content_advisories": ["violence", "mild language"],
  "original_language": "en",
  "total_seasons": 1,
  "poster_url": "https://cdn.wisp.tv/posters/tears-of-steel.jpg",
  "backdrop_url": "https://cdn.wisp.tv/backdrops/tears-of-steel.jpg",
  "episodes": [
    {
      "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
      "season_number": 1,
      "episode_number": 1,
      "title": "The Amsterdam Recalibration",
      "summary": "Barley and the resistance crew power up the holographic rig to project Thom into past memories.",
      "duration_ms": 734000,
      "video_stream_url": "https://cdn.wisp.tv/video/tears-of-steel/index.m3u8"
    }
  ]
}
```

---

### 6.3 Get Episode by ID
`GET /api/v1/catalog/episodes/:episodeId`

#### Route Parameters
* `episodeId` (`UUID v4`): Unique episode identifier.

#### Response `200 OK`
```json
{
  "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
  "program_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
  "season_number": 1,
  "episode_number": 1,
  "title": "The Amsterdam Recalibration",
  "summary": "Barley and the resistance crew power up the holographic rig to project Thom into past memories.",
  "duration_ms": 734000,
  "intro_end_ms": 15000,
  "credits_start_ms": 710000,
  "default_bucket_sec": 15,
  "video_stream_url": "https://cdn.wisp.tv/video/tears-of-steel/index.m3u8",
  "subtitle_vtt_url": "https://cdn.wisp.tv/subtitles/tears-of-steel-en.vtt",
  "thumbnail_sprite_url": "https://cdn.wisp.tv/sprites/tears-of-steel-sprites.vtt",
  "is_published": true
}
```

---

## 7. Household Viewing Profiles API (`ProfilesController`)

All profile endpoints require device authentication via `DeviceAuthGuard` (`Authorization: Bearer <deviceToken>`). Devices are strictly limited to accessing and mutating their own household profiles.

### 7.1 List Device Profiles
`GET /api/v1/profiles`

Returns all viewing profiles configured for the authenticated Fire TV device.

#### Response `200 OK`
```json
[
  {
    "id": "11111111-1111-1111-1111-111111111111",
    "deviceId": "firetv-living-room-001",
    "displayName": "Living Room TV",
    "mode": "quick_glance",
    "spoilerStrictness": "strict",
    "preferredLanguage": "en",
    "voiceTtsEnabled": true,
    "autoPauseOnOverlay": false,
    "totalQueriesCount": 42,
    "lastActiveAt": "2026-10-19T02:25:00.000Z"
  }
]
```

---

### 7.2 Create Profile
`POST /api/v1/profiles`

#### Request Body (`CreateProfileDto`)
```json
{
  "deviceId": "firetv-living-room-001",
  "displayName": "Kids Mode",
  "mode": "family_friendly",
  "spoilerStrictness": "strict",
  "voiceTtsEnabled": true,
  "avatarColor": "#38BDF8"
}
```

#### Response `201 Created`
```json
{
  "id": "11111111-1111-1111-1111-111111111112",
  "deviceId": "firetv-living-room-001",
  "displayName": "Kids Mode",
  "mode": "family_friendly",
  "spoilerStrictness": "strict",
  "voiceTtsEnabled": true,
  "totalQueriesCount": 0,
  "createdAt": "2026-10-19T02:30:00.000Z"
}
```

---

### 7.3 Update Profile Preferences
`PATCH /api/v1/profiles/:profileId`

#### Request Body (`UpdateProfileDto`)
```json
{
  "displayName": "Movie Night (Deep Lore)",
  "mode": "deep_lore",
  "spoilerStrictness": "moderate"
}
```

#### Response `200 OK`
```json
{
  "id": "11111111-1111-1111-1111-111111111111",
  "displayName": "Movie Night (Deep Lore)",
  "mode": "deep_lore",
  "spoilerStrictness": "moderate",
  "updatedAt": "2026-10-19T02:31:00.000Z"
}
```

---

### 7.4 Touch Profile Activity
`POST /api/v1/profiles/:profileId/touch`

Updates the `last_active_at` timestamp for the specified profile without changing preferences.

#### Response `200 OK`
```json
{
  "success": true,
  "profileId": "11111111-1111-1111-1111-111111111111",
  "lastActiveAt": "2026-10-19T02:32:00.000Z"
}
```

---

### 7.5 Delete Profile (with Sole-Profile Retention Safety)
`DELETE /api/v1/profiles/:profileId`

Atomically deletes a profile by calling the database RPC `delete_viewing_profile`. Guards against deleting the sole remaining profile on a device.

#### Response `200 OK`
```json
{
  "success": true,
  "message": "Profile 11111111-1111-1111-1111-111111111112 deleted successfully"
}
```

#### Error Response `400 Bad Request` (Sole Profile Guard)
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Cannot delete the sole profile for a device"
}
```

---

## 8. Standalone Programmatic API (`@wisp/ai-engine`)

When developing AI feature modules on the `ai-integration` branch without running the NestJS backend or PostgreSQL database:

```ts
import { WispAiEngine } from '@wisp/ai-engine';

// 1. Initialize standalone engine with provider API key
const engine = WispAiEngine.createStandalone({
  groqApiKey: process.env.GROQ_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
});

// 2. Fetch instant Stage-1 scene context
const sceneContext = await engine.getInstantSceneContext(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  135000 // 02:15 into Tears of Steel
);

// 3. Execute Stage-2 grounded AI query
const responseCard = await engine.execute({
  episodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  playbackPositionMs: 135000,
  actionType: 'scene_explain',
  prompt: 'Why are they recreating the bridge memory?',
  profileMode: 'quick_glance',
});

console.log(responseCard.headline);
// "The Bridge Memory Reenactment"
```

---

## 9. Supabase PostgreSQL RPC API Specification

All 15 PostgreSQL stored procedures are executed via direct RPC (`POST /rest/v1/rpc/<rpc_name>`) or via `@supabase/supabase-js` (`supabase.rpc('<rpc_name>', { ... })`).

### 9.1 Client-Facing RPCs

| Function Name | Return Type | Arguments & Defaults | Scope |
| :--- | :--- | :--- | :--- |
| `get_firetv_stage1_bootstrap` | `jsonb` | `p_episode_id uuid, p_device_id text, p_playback_ms bigint, p_profile_id uuid DEFAULT NULL` | `anon, authenticated, service_role` |
| `get_spoiler_safe_context` | `jsonb` | `p_episode_id uuid, p_playback_ms bigint, p_lookback_ms bigint DEFAULT 180000` | `anon, authenticated, service_role` |
| `search_spoiler_safe_transcript` | `jsonb` | `p_episode_id uuid, p_playback_ms bigint, p_search_query text, p_limit integer DEFAULT 8` | `anon, authenticated, service_role` |
| `hybrid_spoiler_safe_rag_search` | `jsonb` | `p_episode_id uuid, p_playback_ms bigint, p_query_text text, p_query_vector float4[] DEFAULT NULL, p_limit integer DEFAULT 6` | `anon, authenticated, service_role` |
| `get_cross_episode_spoiler_safe_context`| `jsonb` | `p_episode_id uuid, p_playback_ms bigint` | `anon, authenticated, service_role` |
| `get_episode_post_watch_quiz` | `jsonb` | `p_episode_id uuid, p_playback_ms bigint, p_profile_mode household_profile_mode DEFAULT 'quick_glance', p_limit integer DEFAULT 3` | `anon, authenticated, service_role` |
| `get_paginated_programs` | `TABLE (...)` | `p_limit integer DEFAULT 20, p_cursor_title text DEFAULT NULL, p_cursor_id uuid DEFAULT NULL, p_ascending boolean DEFAULT true, p_genre text DEFAULT NULL, p_query text DEFAULT NULL` | `anon, authenticated, service_role` |
| `cosine_similarity_float4` | `float8` | `p_vec_a float4[], p_vec_b float4[]` | `anon, authenticated, service_role` |

### 9.2 Service-Role Restricted RPCs

| Function Name | Return Type | Arguments & Defaults | Scope |
| :--- | :--- | :--- | :--- |
| `delete_viewing_profile` | `jsonb` | `p_profile_id uuid, p_device_id text` | `service_role` exclusively |
| `get_database_health_and_metrics` | `jsonb` | *(None)* | `service_role` exclusively |
| `purge_expired_cache_and_rate_limits` | `jsonb` | *(None)* | `service_role` exclusively |
| `upsert_ai_response_cache` | `void` | `p_cache_key text, p_episode_id uuid, p_action_type text, p_profile_mode household_profile_mode, p_time_bucket_sec integer, p_provider_used text, p_response_payload jsonb, p_origin_latency_ms integer DEFAULT NULL, p_token_count integer DEFAULT NULL, p_ttl_seconds integer DEFAULT 86400` | `service_role` exclusively |
| `get_or_touch_ai_cache` | `jsonb` | `p_cache_key text` | `service_role` exclusively |
| `check_device_rate_limit` | `jsonb` | `p_device_id text, p_window_sec integer DEFAULT 60, p_max_requests integer DEFAULT 30` | `service_role` exclusively |
| `record_wisp_interaction` | `uuid` | `p_profile_id uuid, p_episode_id uuid, p_playback_position_ms bigint, p_action_type text, p_user_prompt text, p_ai_provider text, p_latency_ms integer, p_cache_hit boolean, p_response_card jsonb, p_prompt_tokens integer DEFAULT 0, p_completion_tokens integer DEFAULT 0, p_failover_triggered boolean DEFAULT false, p_error_code text DEFAULT NULL` | `service_role` exclusively |
