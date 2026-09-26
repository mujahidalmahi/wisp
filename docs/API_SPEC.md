# Wisp REST API Specification

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

## 2. Stage-1 Instant Scene Context Lookup
`GET /api/v1/context/:episodeId?playbackMs=135000`

Returns pre-computed scene metadata, unlocked entities, and zero-typing D-pad Quick Action Chips strictly bounded up to `playbackMs`.

### Response `200 OK`
```json
{
  "metadata": {
    "program_title": "Tears of Steel",
    "genre": "Sci-Fi / Cyberpunk",
    "episode_title": "The Oude Kerk Protocol",
    "season_number": 1,
    "episode_number": 1,
    "playback_position_ms": 135000
  },
  "active_scene": {
    "scene_index": 2,
    "scene_title": "Inside the Oude Kerk Dome",
    "location_name": "Fortified Oude Kerk, Future Amsterdam",
    "spoiler_safe_summary": "An older Thom enters the holographic simulation chamber while Captain Barley and his tech crew monitor the approaching robot swarm outside.",
    "quick_action_chips": [
      {
        "id": "chip-4",
        "label": "Catch me up to this moment",
        "actionType": "episode_recap"
      }
    ]
  }
}
```

---

## 3. Stage-2 Grounded AI Query
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
