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
