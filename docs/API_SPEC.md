# Wisp REST & Programmatic API Specification

Base URL (Local Dev / Fire OS Emulator): `http://10.0.2.2:3000/api/v1`  
Base URL (Cloudflare Edge): `https://wisp-edge.your-subdomain.workers.dev/api/v1`

---

## 1. Health Check
`GET /api/v1/health`

### Response `200 OK`
```json
{
  "status": "ok",
  "service": "wisp-backend",
  "timestamp": "2026-09-26T16:00:00.000Z"
}
```

---

## 2. List Registered AI Features (`@wisp/ai-engine`)
`GET /api/v1/wisp/features`

Returns all modular AI feature pipelines currently registered in `AiFeatureRegistry`.

### Response `200 OK`
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

## 3. Stage-1 Instant Scene Context Lookup
`GET /api/v1/context/:episodeId?playbackMs=135000`

Returns pre-computed scene metadata, unlocked entities, and zero-typing D-pad Quick Action Chips strictly bounded up to `playbackMs`.

### Response `200 OK`
```json
{
  "scene": {
    "id": "cccccccc-cccc-cccc-cccc-cccccccccccc1",
    "sceneNumber": 1,
    "title": "Amsterdam Neural Projection",
    "summary": "Barley initiates the neural memory rig inside the Oude Kerk.",
    "startTimeMs": 0,
    "endTimeMs": 120000,
    "quickActionChips": [
      { "id": "c1", "label": "Why are they in the church?", "actionType": "scene_explain" },
      { "id": "c2", "label": "Who is Thom?", "actionType": "entity_explain" },
      { "id": "c3", "label": "Catch me up", "actionType": "episode_recap" }
    ]
  },
  "unlockedEntities": [
    {
      "id": "dddddddd-dddd-dddd-dddd-dddddddddddd1",
      "canonicalName": "Thom",
      "entityType": "character",
      "shortDescription": "Former lover of Celia undergoing memory reconstruction."
    }
  ],
  "spoilerSafeUpToMs": 120000
}
```

---

## 4. Stage-2 Grounded AI Query
`POST /api/v1/wisp/query`

### Request Body
```json
{
  "episodeId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
  "playbackPositionMs": 135000,
  "actionType": "scene_explain",
  "prompt": "Why are they recreating the bridge memory?",
  "profileMode": "quick_glance"
}
```

### Response `200 OK`
```json
{
  "headline": "The Bridge Memory Reenactment",
  "body": "Resistance Commander Barley is projecting Thom into a holographic recreation of his breakup with Celia 40 years ago, hoping to resolve the emotional trauma driving the machine offensive.",
  "bulletPoints": [
    "Set inside the fortified Oude Kerk in Amsterdam",
    "Perimeter turrets are holding back the approaching robot swarm"
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

## 5. Standalone Programmatic API (`@wisp/ai-engine`)

When working on the `ai-integration` branch without NestJS or Supabase running:

```ts
import { WispAiEngine } from '@wisp/ai-engine';

const engine = WispAiEngine.createStandalone({
  groqApiKey: process.env.GROQ_API_KEY,
});

const sceneContext = await engine.getInstantSceneContext('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 135000);
const responseCard = await engine.execute({
  episodeId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  playbackPositionMs: 135000,
  actionType: 'scene_explain',
  prompt: 'Why are they recreating the bridge memory?',
  profileMode: 'quick_glance',
});
```

---

## 6. Supabase PostgreSQL RPC API Specification

For detailed schema constraints, triggers, and mathematical invariants, see [**`docs/DATABASE_ARCHITECTURE.md`**](./DATABASE_ARCHITECTURE.md).

All RPC endpoints can be invoked via HTTP (`POST https://<project>.supabase.co/rest/v1/rpc/<function_name>`) or via `@supabase/supabase-js` (`supabase.rpc('<function_name>', { ...params })`).

### 6.1 `get_firetv_stage1_bootstrap`
Optimized single-roundtrip endpoint delivering profile, active scene, 3–4 D-pad chips, and program context in `<50ms`.

* **HTTP Method / Path:** `POST /rest/v1/rpc/get_firetv_stage1_bootstrap`
* **Authorization Scope:** `anon`, `authenticated`, `service_role`
* **Request Payload:**
```json
{
  "p_device_id": "firetv-living-room-001",
  "p_episode_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
  "p_playback_ms": 135000
}
```
* **Response `200 OK`:**
```json
{
  "device_id": "firetv-living-room-001",
  "profile": {
    "id": "11111111-1111-1111-1111-111111111111",
    "name": "Living Room TV",
    "mode": "quick_glance"
  },
  "program": {
    "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
    "title": "Tears of Steel",
    "genre": "Sci-Fi"
  },
  "episode": {
    "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
    "title": "The Amsterdam Recalibration",
    "duration_ms": 734000
  },
  "scene": {
    "id": "cccccccc-cccc-cccc-cccc-cccccccccccc2",
    "scene_number": 2,
    "title": "The Memory Projection Begins",
    "summary": "Barley initiates the holographic rig; Thom is placed into the memory.",
    "start_time_ms": 120000,
    "end_time_ms": 240000
  },
  "quick_action_chips": [
    { "id": "c1", "label": "Why the bridge memory?", "actionType": "scene_explain" },
    { "id": "c2", "label": "Who is Barley?", "actionType": "entity_explain" },
    { "id": "c3", "label": "Recap so far", "actionType": "episode_recap" }
  ],
  "unlocked_entities_count": 3,
  "server_timestamp": "2026-10-06T23:30:00.000Z"
}
```

---

### 6.2 `get_spoiler_safe_context`
Primary anti-spoiler context engine for Stage-1 inspection and LLM prompt grounding.

* **HTTP Method / Path:** `POST /rest/v1/rpc/get_spoiler_safe_context`
* **Authorization Scope:** `anon`, `authenticated`, `service_role`
* **Request Payload:**
```json
{
  "p_episode_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
  "p_playback_ms": 135000
}
```
* **Response `200 OK`:**
```json
{
  "scene": {
    "id": "cccccccc-cccc-cccc-cccc-cccccccccccc2",
    "scene_number": 2,
    "scene_title": "The Memory Projection Begins",
    "summary": "Barley initiates the holographic rig; Thom is placed into the memory.",
    "start_time_ms": 120000,
    "end_time_ms": 240000,
    "quick_action_chips": [...],
    "key_events": ["Rig powered on", "Thom enters memory state"],
    "visual_anchors": ["Cables connected to Thom", "Holographic green grid"]
  },
  "recent_dialogue": [
    {
      "speaker": "BARLEY",
      "dialogue": "Hold your positions! We need this rig online now!",
      "start_time_ms": 125000,
      "end_time_ms": 131000
    }
  ],
  "unlocked_entities": [
    {
      "id": "dddddddd-dddd-dddd-dddd-dddddddddddd1",
      "canonical_name": "Thom",
      "entity_type": "character",
      "aliases": ["Thomas"],
      "short_description": "Former lover of Celia undergoing memory reconstruction.",
      "spoiler_tier": "safe"
    }
  ],
  "unlocked_relationships": [
    {
      "source_name": "Thom",
      "target_name": "Celia",
      "relationship_type": "former_lovers",
      "description": "Broke up 40 years ago before the robot war."
    }
  ],
  "metadata": {
    "playback_ms": 135000,
    "episode_duration_ms": 734000,
    "watch_percentage": 18.39
  }
}
```

---

### 6.3 `hybrid_spoiler_safe_rag_search`
Executes pure-SQL hybrid Reciprocal Rank Fusion (RRF) combining keyword full-text search and dense vector cosine similarity.

* **HTTP Method / Path:** `POST /rest/v1/rpc/hybrid_spoiler_safe_rag_search`
* **Authorization Scope:** `anon`, `authenticated`, `service_role`
* **Request Payload:**
```json
{
  "p_episode_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
  "p_query": "Why did Celia attack humanity?",
  "p_query_embedding": [0.024, -0.051, 0.112, "... (384 float4 values)"],
  "p_playback_ms": 135000,
  "p_limit": 3,
  "p_rrf_k": 60
}
```
* **Response `200 OK`:**
```json
[
  {
    "id": "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee1",
    "content_type": "transcript",
    "reference_id": "ffffffff-ffff-ffff-ffff-ffffffffffff1",
    "text_chunk": "BARLEY: She took over the machine army forty years ago.",
    "start_time_ms": 80000,
    "end_time_ms": 85000,
    "reveal_time_ms": 85000,
    "lexical_rank": 1,
    "vector_rank": 2,
    "rrf_score": 0.03251
  }
]
```

---

### 6.4 `get_cross_episode_spoiler_safe_context`
Returns cross-episode lore for serialized shows by unlocking completed episodes plus current episode up to `p_playback_ms`.

* **HTTP Method / Path:** `POST /rest/v1/rpc/get_cross_episode_spoiler_safe_context`
* **Authorization Scope:** `anon`, `authenticated`, `service_role`
* **Request Payload:**
```json
{
  "p_program_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3",
  "p_current_episode_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3",
  "p_playback_ms": 450000,
  "p_completed_episode_ids": []
}
```

---

### 6.5 `get_paginated_programs`
Keyset/cursor paginated catalog query for the Fire TV Home Screen.

* **HTTP Method / Path:** `POST /rest/v1/rpc/get_paginated_programs`
* **Authorization Scope:** `anon`, `authenticated`, `service_role`
* **Request Payload:**
```json
{
  "p_limit": 10,
  "p_cursor_created_at": "2026-10-01T12:00:00.000Z",
  "p_cursor_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
  "p_genre": "Sci-Fi"
}
```
* **Response `200 OK`:**
```json
[
  {
    "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
    "title": "Cosmic Origins: Deep Field",
    "synopsis": "Exploring the distant universe with the James Webb Space Telescope.",
    "genre": "Science Doc",
    "content_rating": "TV-G",
    "total_seasons": 1,
    "created_at": "2026-09-30T10:00:00.000Z",
    "has_more": false
  }
]
```

---

### 6.6 `delete_viewing_profile`
Deletes a viewing profile while guarding against removing the last active profile for a hardware device.

* **HTTP Method / Path:** `POST /rest/v1/rpc/delete_viewing_profile`
* **Authorization Scope:** `anon`, `authenticated`, `service_role`
* **Request Payload:**
```json
{
  "p_profile_id": "11111111-1111-1111-1111-111111111112",
  "p_device_id": "firetv-living-room-001"
}
```
* **Response `200 OK`:**
```json
{
  "deleted": true,
  "profile_id": "11111111-1111-1111-1111-111111111112",
  "device_id": "firetv-living-room-001"
}
```
* **Error Response `400 Bad Request / Exception LAST_PROFILE`:**
```json
{
  "code": "LAST_PROFILE",
  "message": "Cannot delete the sole profile for a device"
}
```

---

### 6.7 `get_database_health_and_metrics` (Service-Role Only)
Telemetry and health monitoring report.

* **HTTP Method / Path:** `POST /rest/v1/rpc/get_database_health_and_metrics`
* **Authorization Scope:** `service_role` exclusively (`anon` and `authenticated` return `401 Unauthorized`)
* **Response `200 OK`:**
```json
{
  "status": "healthy",
  "checked_at": "2026-10-06T23:30:00.000Z",
  "counts": {
    "programs": 3,
    "episodes": 3,
    "scenes": 11,
    "transcripts": 35,
    "entities": 15,
    "embeddings": 12,
    "profiles": 4,
    "cached_responses": 18
  },
  "cache_performance": {
    "total_entries": 18,
    "total_hits": 142,
    "hit_ratio_pct": 88.75
  },
  "latency_p95_by_provider": [
    { "provider": "groq", "model": "llama-3.3-70b-versatile", "p95_ms": 380.0 },
    { "provider": "gemini", "model": "gemini-2.5-flash", "p95_ms": 620.0 }
  ],
  "spoiler_anomalies_detected": 0
}
```

