# Wisp Backend API Specification for Fire TV Client Team
**Version:** 1.0.0 (Production)  
**Author:** Wisp Backend Engineering Team  
**Audience:** Fire TV Frontend Engineering Team (`frontend/`), Edge Gateway Maintainers  
**Target Platform:** Amazon Fire TV (Fire OS / Android TV), Vega SDK, React Native TVOS  
**Base Protocol:** HTTPS / JSON REST API  

---

## 1. Architectural Overview & Environment Addressing

The Wisp backend is a NestJS 10 enterprise service backed by Supabase PostgreSQL 18, providing deterministic temporal spoiler safety, device-bound authentication, cursor-paginated catalog metadata, and multi-provider AI context synthesis.

All routes are mounted under the global API prefix:
```
/api/v1
```

### Base URL Addressing Matrix

| Environment | Base URL | Usage Notes |
| :--- | :--- | :--- |
| **Fire TV Physical Device (LAN)** | `http://<HOST_IP>:3000/api/v1` | Local development when Fire TV stick and dev machine share the same Wi-Fi subnet. |
| **Fire OS / Android Emulator** | `http://10.0.2.2:3000/api/v1` | Standard Android emulator host loopback alias. Replaces `localhost`. |
| **Localhost (Host Machine)** | `http://localhost:3000/api/v1` | Development tools, web viewer tests, or when using `adb reverse tcp:3000 tcp:3000`. |
| **Cloudflare Edge Gateway** | `https://edge.wisp.tv/api/v1` | Production / Zero-ADB edge routing proxy with response caching. |

### Core Architectural Invariants for Frontend Integration
1. **Deterministic Spoiler Boundary:** Playback position (`playbackMs` / `playbackPositionMs`) is clamped to `[0, episode_duration_ms]`. The backend will never emit transcripts, scene recaps, or entity revelations occurring after `playbackMs`.
2. **Zero-Typing 10-Foot First UX:** All scene responses and AI cards return 2 to 4 D-pad selectable `QuickActionChip` items. Frontend text-entry fields must remain strictly secondary fallback mechanisms.
3. **Device-Bound Security:** All playback context and profile mutation endpoints require a cryptographically signed device token. Device secrets and backend master keys are never stored on untrusted clients.
4. **Latency Budget:** Stage-1 instant UI and single-roundtrip bootstrap endpoints are tuned for sub-50ms response times. Do not chain multiple sequential network calls when opening the Wisp overlay drawer.

---

### Frontend Component to API Route Mapping Matrix

| Frontend Component (`frontend/src/`) | User Interaction / Event | Backend Route & HTTP Method | Exchanged Contract |
| :--- | :--- | :--- | :--- |
| **`App.tsx`** | First application launch / Onboarding | `POST /api/v1/auth/enroll` | Exchanges pairing code for `deviceSecret` and JWT token. |
| **`App.tsx` / `api.client.ts`** | Session resumption / On 401 token expiry | `POST /api/v1/auth/device-token` | Silent token renewal using stored `deviceSecret`. |
| **`VideoPlayerSurface.tsx`** | Player mount & Stream setup | `GET /api/v1/catalog/episodes/:episodeId` | Fetches `video_stream_url`, `duration_ms`, `intro_end_ms`, `credits_start_ms`. |
| **`WispOverlayDrawer.tsx`** | Viewer invokes Wisp remote button | `GET /api/v1/context/:episodeId/bootstrap` | Stage-1 fast-path (<50ms): profile, scene, chips, prewarmed cards. |
| **`WispOverlayDrawer.tsx`** | Lightweight context polling / seek update | `GET /api/v1/context/:episodeId` | Raw `InstantSceneContext` / `TemporalProgramContext`. |
| **`QuickActionChips.tsx`** | Viewer selects D-pad Quick Action Chip | `POST /api/v1/wisp/query` | Dispatches `actionType` & prompt; returns `WispResponseCardDto`. |
| **`ProfileModeSelector.tsx`** | Drawer open / Profile selector render | `GET /api/v1/profiles` | Fetches `ViewingProfile[]` owned by this device. |
| **`ProfileModeSelector.tsx`** | Viewer selects profile pill | `POST /api/v1/profiles/:profileId/touch` | Updates `last_active_at` on the active profile. |
| **`ProfileModeSelector.tsx`** | Viewer toggles mode (e.g. Quick Glance) | `PATCH /api/v1/profiles/:profileId` | Updates household profile mode & voice TTS preference. |
| **Quiz Modal (`Drawer`)** | Viewer plays episode trivia quiz | `POST /api/v1/wisp/query` (`post_watch_quiz`) | Returns 4-option `quizPayload` with `correctIndex` & explanation. |
| **Home / Catalog Carousel** | Viewer browses catalog by genre | `GET /api/v1/catalog/programs` | Cursor-paginated `ProgramSummary[]` items. |
| **Program Detail Screen** | Viewer selects show to browse episodes | `GET /api/v1/catalog/programs/:slug` | Returns `ProgramWithEpisodes` with complete playable episode array. |

---

### D-Pad Spatial Navigation & Focus Invariants (FL-002)
1. **Focus Trapping:** When `WispOverlayDrawer` transitions to `visible={true}`, D-pad focus must be given to the first Quick Action Chip via `hasTVPreferredFocus={index === 0}`. The bottom trigger bar in `VideoPlayerSurface` must be hidden or have `focusable={false}` while the drawer is open to prevent background focus trapping.
2. **Zero-Typing Remote UX:** All scene interactions must be executable with 1-click D-pad selection. The on-screen keyboard must never be presented as the primary interaction path.


---

## 2. Global Request & Response Specifications

### Standard Request Headers

| Header | Format | Required | Purpose |
| :--- | :--- | :--- | :--- |
| `Content-Type` | `application/json` | Yes (for POST/PATCH) | MIME type for request bodies. |
| `Authorization` | `Bearer <token>` | Yes (Protected routes) | Cryptographically signed device token or operator token. Can also use `Device <token>`. |
| `X-Device-Token` | `<token>` | Alternative | Supported alternative header for device token transmission. |
| `X-Request-Id` | `UUIDv4` or `^[a-zA-Z0-9_-]{1,64}$` | Optional (Recommended) | Distributed correlation ID. If omitted, the server generates a UUIDv4. |
| `Accept` | `application/json` | Optional | MIME type expected by client. |

### Standard Response Headers

| Header | Example Value | Description |
| :--- | :--- | :--- |
| `X-Request-Id` | `f47ac10b-58cc-4372-a567-0e02b2c3d479` | Correlation identifier for request tracing and log debugging. |
| `X-Response-Time` | `12.45ms` | Server-side execution duration measured via high-resolution timer. |
| `X-Wisp-Temporal-Floor-Ms` | `45000` | Temporal position used by the backend to clamp spoiler filters. |
| `Cache-Control` | `private, no-cache, no-transform` | Prevents intermediate proxy caching of sensitive viewer context. |

### Standard Error Response Envelope

All error responses return a standardized JSON structure with consistent HTTP status codes:

```json
{
  "statusCode": 400,
  "timestamp": "2026-10-06T11:30:00.000Z",
  "path": "/api/v1/context/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
  "correlationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "error": "BadRequestException",
  "message": "playbackMs cannot exceed 86400000 (24 hours)"
}
```

### Error Code Mapping Reference

| HTTP Status | Exception Name | Typical Scenario | Frontend Action Required |
| :--- | :--- | :--- | :--- |
| `400 Bad Request` | `BadRequestException` | Validation pipe failure, invalid UUID, sole profile deletion attempt. | Display validation error, do not retry without correcting inputs. |
| `401 Unauthorized` | `UnauthorizedException` | Missing token, expired token, signature invalid, device revoked. | Trigger token renewal flow via `POST /api/v1/auth/device-token`. If renewal fails, trigger re-enrollment. |
| `403 Forbidden` | `ForbiddenException` | Device ID mismatch between token and payload, cross-device profile access. | Clear corrupted local cache; ensure requests use the device ID from the authenticated token. |
| `404 Not Found` | `NotFoundException` | Unknown episode ID, unknown program slug, profile does not exist. | Navigate back to catalog or show content unavailable notice. |
| `409 Conflict` | `ConflictException` | Profile name duplicate on device, database unique constraint hit. | Prompt viewer for a distinct profile display name. |
| `429 Too Many Requests` | `ThrottlerException` | Rate limit exceeded (limit: 45 requests / 60 seconds window). | Throttle client polling; back off with exponential jitter before retrying. |
| `503 Service Unavailable` | `ServiceUnavailableException` | Database offline, unconfigured production environment, network timeout. | Fall back to local `@wisp/ai-engine` offline mode or show retry screen. |

---

## 3. Device Authentication & Session Lifecycle

The Fire TV client must authenticate all viewer interactions through a device-bound credential flow.

```
+---------------------------------------------------------------------------------------+
|                               DEVICE AUTHENTICATION FLOW                              |
|                                                                                       |
|   1. First Launch (Enrollment):                                                       |
|      Fire TV Client --------> POST /api/v1/auth/enroll                                |
|                               (Body: { deviceId, enrollmentCode })                    |
|                      <-------- Response: { deviceId, deviceSecret, token, expires_in }|
|      Client stores deviceSecret and token securely in AsyncStorage / EncryptedStorage  |
|                                                                                       |
|   2. Normal Operation:                                                                |
|      Fire TV Client --------> GET /api/v1/context/:episodeId/bootstrap                |
|                               (Header: Authorization: Bearer <token>)                 |
|                      <-------- Response: 200 OK (Stage-1 Bootstrap Payload)           |
|                                                                                       |
|   3. Token Expiration (Renewal):                                                      |
|      Fire TV Client receives 401 Unauthorized                                         |
|      Fire TV Client --------> POST /api/v1/auth/device-token                          |
|                               (Body: { deviceId, deviceSecret })                      |
|                      <-------- Response: { token, expires_in, ... }                   |
|      Client updates stored token and retries failed request                           |
+---------------------------------------------------------------------------------------+
```

### Storage Invariants on Fire TV
- `deviceId`: Persistent hardware-derived identifier (e.g., `Settings.Secure.ANDROID_ID` or Amazon Fire TV Device ID).
- `deviceSecret`: High-entropy secret derived during enrollment. **Never expose this to UI layers or logs.**
- `token`: Short/medium-lived JWT signed by the server (`typ: "device-token"`, algorithm `HS256`, validity 30 days default).

---

## 4. Complete Endpoint Reference

---

### Module 1: Authentication (`/api/v1/auth`)

#### 1.1 Device Enrollment
- **Path:** `POST /api/v1/auth/enroll`
- **Method:** `POST`
- **Auth Guard:** Public / Enrollment Code Gated
- **Purpose:** Initial onboarding of a Fire TV device. Exchanges a single-use pairing code (or operator token) for persistent device credentials.

**Request Headers:**
- `Content-Type: application/json`
- `X-Enrollment-Code: <string>` *(Optional, can also pass in body)*
- `X-Operator-Token: <string>` *(Optional, for authorized operator setup)*

**Request Body (`IssueDeviceTokenDto`):**
```json
{
  "deviceId": "firetv-living-room-01",
  "enrollmentCode": "a1b2c3d4e5f60718"
}
```
*Note for local development: In non-production environments (`NODE_ENV !== 'production'`), clients can supply `"enrollmentKey": "wisp-dev-device-enrollment-secret-2026"` instead of a single-use code.*

**Success Response (`200 OK`):**
```json
{
  "deviceId": "firetv-living-room-01",
  "deviceSecret": "e7b0a5f98123456789abcdef0123456789abcdef0123456789abcdef01234567",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkZXZpY2VJZCI6ImZpcmV0di1saXZpbmctcm9vbS0wMSIsInR5cCI6ImRldmljZS10b2tlbiIsImlhdCI6MTc5MTI1MDAwMCwiZXhwIjoxNzkzODQyMDAwLCJpc3MiOiJ3aXNwLWRldmljZS1hdXRoIiwiYXVkIjoid2lzcC1maXJldHYtY2xpZW50Iiwic3ViIjoiZmlyZXR2LWxpdmluZy1yb29tLTAxIn0.xxx",
  "expires_in": 2592000,
  "token_type": "Bearer"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid `deviceId` format (must be 3–128 characters, alphanumeric plus `_`, `-`, `.`, `:`).
- `401 Unauthorized`: Enrollment code is invalid, already consumed, expired, or device has been revoked.

---

#### 1.2 Device Token Renewal
- **Path:** `POST /api/v1/auth/device-token`
- **Method:** `POST`
- **Auth Guard:** Device Secret Verification
- **Purpose:** Seamlessly renews an expired JWT token using the stored `deviceSecret`.

**Request Body (`IssueDeviceTokenDto`):**
```json
{
  "deviceId": "firetv-living-room-01",
  "deviceSecret": "e7b0a5f98123456789abcdef0123456789abcdef0123456789abcdef01234567"
}
```

**Success Response (`200 OK`):**
```json
{
  "deviceId": "firetv-living-room-01",
  "deviceSecret": "e7b0a5f98123456789abcdef0123456789abcdef0123456789abcdef01234567",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 2592000,
  "token_type": "Bearer"
}
```

**Error Responses:**
- `401 Unauthorized`: `deviceSecret` invalid, does not match epoch, or device is revoked.

---

### Module 2: Catalog & Video Metadata (`/api/v1/catalog`)

#### 2.1 List Programs (Cursor-Paginated)
- **Path:** `GET /api/v1/catalog/programs`
- **Method:** `GET`
- **Auth Guard:** Public
- **Purpose:** Populates the Fire TV home screen and genre carousels. Uses deterministic cursor pagination instead of offset.

**Query Parameters:**
| Parameter | Type | Required | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `genre` | `string` | No | - | Max 50 chars | Filter by genre (e.g., `Sci-Fi`, `Mystery`, `Science Documentary`). |
| `q` | `string` | No | - | Max 100 chars | Free-text search query for titles and synopses. |
| `limit` | `integer` | No | `20` | Min 1, Max 100 | Items per page. |
| `cursor` | `string` | No | - | Max 256 chars | Opaque cursor token returned from previous page (`next_cursor`). |
| `order` | `string` | No | `asc` | `asc` or `desc` | Lexicographical title sort direction. |

**Success Response (`200 OK`):**
```json
{
  "items": [
    {
      "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
      "slug": "tears-of-steel",
      "title": "Tears of Steel",
      "genre": "Sci-Fi",
      "synopsis": "Set in a dystopian future Amsterdam, scientists stage a temporal calibration.",
      "release_year": 2012,
      "rating": "TV-14",
      "poster_url": "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800",
      "backdrop_url": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200",
      "license_info": "CC-BY Blender Foundation",
      "is_active": true,
      "episode_count": 2
    }
  ],
  "pagination": {
    "limit": 20,
    "next_cursor": "VGVhcnMgb2YgU3RlZWw6YWFhYWFhYWEtYWFhYS1hYWFhLWFhYWEtYWFhYWFhYWFhYWEx",
    "has_more": false
  }
}
```

**Frontend Implementation Notes:**
- Pass `cursor: response.pagination.next_cursor` when the viewer scrolls to the right edge of a D-pad carousel.
- When `has_more === false`, stop pagination requests.

---

#### 2.2 Get Program Details by Slug
- **Path:** `GET /api/v1/catalog/programs/:slug`
- **Method:** `GET`
- **Auth Guard:** Public
- **Purpose:** Detail view for a program, including the full ordered list of playable episodes.

**Path Parameters:**
- `slug`: kebab-case string (e.g., `tears-of-steel`). Validated via `ParseSlugPipe`.

**Success Response (`200 OK`):**
```json
{
  "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
  "slug": "tears-of-steel",
  "title": "Tears of Steel",
  "genre": "Sci-Fi",
  "synopsis": "Set in a dystopian future Amsterdam...",
  "release_year": 2012,
  "rating": "TV-14",
  "poster_url": "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800",
  "backdrop_url": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200",
  "license_info": "CC-BY Blender Foundation",
  "is_active": true,
  "episode_count": 2,
  "episodes": [
    {
      "id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
      "program_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
      "program_title": "Tears of Steel",
      "program_slug": "tears-of-steel",
      "season_number": 1,
      "episode_number": 1,
      "title": "The Amsterdam Calibration",
      "summary": "Thom, Celia, and their crew gather atop the Oude Kerk watchtower...",
      "duration_ms": 734000,
      "video_stream_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
      "thumbnail_url": "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600",
      "intro_end_ms": 45000,
      "credits_start_ms": 690000,
      "default_bucket_sec": 15,
      "is_published": true,
      "prev_episode_id": null,
      "next_episode_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2"
    }
  ]
}
```

**Error Responses:**
- `400 Bad Request`: Malformed slug (contains spaces or uppercase characters).
- `404 Not Found`: No program exists matching the provided slug.

---

#### 2.3 Get Episode Details by ID
- **Path:** `GET /api/v1/catalog/episodes/:episodeId`
- **Method:** `GET`
- **Auth Guard:** Public
- **Purpose:** Retrieves playback parameters, stream URL, and temporal boundaries for a specific episode.

**Path Parameters:**
- `episodeId`: Valid UUIDv4 string.

**Success Response (`200 OK`):**
Returns the `EpisodeDetails` object as shown in Section 2.2.

**Error Responses:**
- `400 Bad Request`: `episodeId` is not a valid UUIDv4.
- `404 Not Found`: Episode ID not found in database or catalog fixtures.

---

### Module 3: Temporal Context Engine (`/api/v1/context`)

#### 3.1 Single-Roundtrip Fire TV Bootstrap (Recommended)
- **Path:** `GET /api/v1/context/:episodeId/bootstrap`
- **Method:** `GET`
- **Auth Guard:** `DeviceAuthGuard` (`Authorization: Bearer <token>`)
- **Purpose:** Primary entrypoint when the viewer presses the Wisp remote button. Returns the active household profile, active scene context, zero-typing Quick Action Chips, verified pre-warmed AI cards, and session state in a single call in under 50ms.

**Path Parameters:**
- `episodeId`: Valid UUIDv4 string.

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `playbackMs` | `integer` | No | `0` | Current video playback head in milliseconds (`0` to `86400000`). |
| `profileId` | `UUIDv4` | No | - | Optional specific viewing profile ID. If omitted, uses device's last active profile. |

**Success Response (`200 OK`):**
```json
{
  "profile": {
    "id": "11111111-1111-1111-1111-111111111111",
    "display_name": "Living Room TV",
    "mode": "quick_glance",
    "spoiler_strictness": "strict",
    "voice_tts_enabled": false
  },
  "active_scene": {
    "scene_index": 1,
    "title": "The Watchtower Calibration",
    "scene_title": "The Watchtower Calibration",
    "location_name": "Oude Kerk Watchtower, Amsterdam",
    "start_time_ms": 0,
    "end_time_ms": 120000,
    "summary": "Thom and Celia align the temporal beacon before drones breach the perimeter.",
    "spoiler_safe_summary": "Thom and Celia align the temporal beacon before drones breach the perimeter.",
    "quick_action_chips": [
      {
        "id": "chip-1",
        "label": "Who is Celia?",
        "actionType": "entity_explain"
      },
      {
        "id": "chip-2",
        "label": "What is the calibration device?",
        "actionType": "scene_explain"
      },
      {
        "id": "chip-3",
        "label": "Quick Scene Recap",
        "actionType": "contextual_qa"
      }
    ]
  },
  "prewarmed_cards": [
    {
      "action_type": "entity_explain",
      "provider": "groq",
      "card": {
        "headline": "Celia — Lead Cyberneticist",
        "body": "Celia is the primary architect of the beacon attempting to revert the cataclysm.",
        "bulletPoints": [
          "Former head of robotics in New Amsterdam",
          "Carries the temporal encryption key"
        ],
        "spoilerSafeUpToMs": 45000,
        "profileMode": "quick_glance",
        "followUpChips": []
      }
    }
  ],
  "session": {
    "session_id": "sess-9a8b7c",
    "current_playback_ms": 45000,
    "recent_turn_count": 0,
    "last_summary": "Opened Wisp during Act 1",
    "pinned_timestamps": [45000]
  },
  "safe_playback_ms": 45000,
  "episode_duration_ms": 734000
}
```

**Frontend Implementation Notes:**
- If `active_scene === null`, no verified scene exists at `playbackMs`. Display the default fallback chips rather than inventing scene data.
- Directly render `active_scene.quick_action_chips` inside the D-pad horizontal chip list. Set `hasTVPreferredFocus={index === 0}` on the first chip.
- If a user clicks a chip matching an entry in `prewarmed_cards`, immediately display that card with zero network latency.

---

#### 3.2 Instant Scene Context (Lightweight)
- **Path:** `GET /api/v1/context/:episodeId`
- **Method:** `GET`
- **Auth Guard:** `DeviceAuthGuard` (`Authorization: Bearer <token>`)
- **Purpose:** Returns the raw temporal program context without profile or session overhead.

**Query Parameters:**
- `playbackMs`: `integer` (default: `0`, max: `86400000`).
- `lookbackMs`: `integer` (default: `120000` [2 minutes], max: `3600000`).

**Success Response (`200 OK`):**
Returns `TemporalProgramContext`:
```json
{
  "episode_id": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
  "playback_ms": 45000,
  "active_scene": {
    "scene_index": 1,
    "title": "The Watchtower Calibration",
    "start_time_ms": 0,
    "end_time_ms": 120000,
    "summary": "Thom and Celia align the temporal beacon..."
  },
  "visible_characters": [
    {
      "character_id": "char-1",
      "name": "Thom",
      "role": "Lead Tactician",
      "bio": "Veteran commander managing the defensive perimeter."
    }
  ],
  "recent_transcript": [
    {
      "start_time_ms": 32000,
      "end_time_ms": 35000,
      "speaker": "Thom",
      "text": "Get the primary conduits online now!"
    }
  ]
}
```

---

### Module 4: Viewing Profiles (`/api/v1/profiles`)

All profile endpoints are scoped strictly to the authenticated device ID extracted from the device token.

#### 4.1 List Profiles for Device
- **Path:** `GET /api/v1/profiles`
- **Method:** `GET`
- **Auth Guard:** `DeviceAuthGuard`
- **Purpose:** Fetches all household profiles associated with the current Fire TV device.

**Success Response (`200 OK`):**
```json
[
  {
    "id": "11111111-1111-1111-1111-111111111111",
    "device_id": "firetv-living-room-01",
    "display_name": "Living Room TV",
    "mode": "quick_glance",
    "spoiler_strictness": "strict",
    "voice_tts_enabled": false,
    "avatar_color": "#4f46e5",
    "last_active_at": "2026-10-06T11:00:00.000Z"
  },
  {
    "id": "22222222-2222-2222-2222-222222222222",
    "device_id": "firetv-living-room-01",
    "display_name": "Kids Profile",
    "mode": "family_friendly",
    "spoiler_strictness": "strict",
    "voice_tts_enabled": true,
    "avatar_color": "#10b981",
    "last_active_at": "2026-10-05T18:30:00.000Z"
  }
]
```

---

#### 4.2 Create Viewing Profile
- **Path:** `POST /api/v1/profiles`
- **Method:** `POST`
- **Auth Guard:** `DeviceAuthGuard`
- **Purpose:** Creates a new household profile on this device.

**Request Body (`CreateProfileDto`):**
```json
{
  "deviceId": "firetv-living-room-01",
  "displayName": "Movie Night",
  "mode": "deep_lore",
  "spoilerStrictness": "moderate",
  "voiceTtsEnabled": false,
  "avatarColor": "#f59e0b"
}
```
*Note: `deviceId` in body must match the authenticated token, or be omitted.*

**Supported Profile Modes:**
- `quick_glance`: Fast, 2-bullet answers (<150 words) optimized for brief pause moments.
- `deep_lore`: Detailed canonical explanations, timeline backstories, and actor bios.
- `family_friendly`: Simplified vocabulary, content-filtered, with automatic TTS enabled.

**Supported Spoiler Strictness:**
- `strict`: Deterministic hard cutoff at `playbackMs`. Zero hints or foreshadowing.
- `moderate`: Soft contextual reminders for established plot points earlier in the episode.
- `off`: Unrestricted lore explanations across all aired episodes.

**Success Response (`201 Created`):**
Returns the newly created `ViewingProfile` object.

---

#### 4.3 Update Viewing Profile
- **Path:** `PATCH /api/v1/profiles/:profileId`
- **Method:** `PATCH`
- **Auth Guard:** `DeviceAuthGuard`
- **Purpose:** Updates profile preferences (mode, display name, voice TTS, avatar color).

**Path Parameters:**
- `profileId`: Valid UUIDv4 string.

**Request Body (`UpdateProfileDto`):**
```json
{
  "displayName": "Master Bedroom TV",
  "mode": "quick_glance",
  "voiceTtsEnabled": true
}
```

**Success Response (`200 OK`):**
Returns the updated `ViewingProfile` object.

**Error Responses:**
- `403 Forbidden`: Profile does not belong to the authenticated device.
- `404 Not Found`: Profile ID does not exist.

---

#### 4.4 Touch Profile (Mark Active)
- **Path:** `POST /api/v1/profiles/:profileId/touch`
- **Method:** `POST`
- **Auth Guard:** `DeviceAuthGuard`
- **Purpose:** Call when the viewer switches profiles on the Fire TV UI. Updates `last_active_at`.

**Success Response (`200 OK`):**
```json
{
  "id": "11111111-1111-1111-1111-111111111111",
  "device_id": "firetv-living-room-01",
  "display_name": "Living Room TV",
  "last_active_at": "2026-10-06T11:45:00.000Z"
}
```

---

#### 4.5 Delete Viewing Profile (Atomic with Sole-Profile Guard)
- **Path:** `DELETE /api/v1/profiles/:profileId`
- **Method:** `DELETE`
- **Auth Guard:** `DeviceAuthGuard`
- **Purpose:** Deletes a viewing profile. Enforces the invariant that a device must retain at least one profile.

**Success Response (`200 OK`):**
```json
{
  "success": true,
  "message": "Profile '11111111-1111-1111-1111-111111111111' deleted successfully"
}
```

**Error Responses:**
- `400 Bad Request`: `Cannot delete the sole viewing profile on this device`. Frontend must disable the delete button when `profiles.length <= 1`.
- `403 Forbidden`: Profile belongs to a different device.
- `404 Not Found`: Profile does not exist.

---

### Module 5: Multi-Provider AI Gateway (`/api/v1/wisp`)

#### 5.1 Query Wisp AI Engine
- **Path:** `POST /api/v1/wisp/query`
- **Method:** `POST`
- **Auth Guard:** Public / Gateway-Throttled
- **Purpose:** Synthesizes an AI response card when the viewer clicks a Quick Action Chip or enters a voice/text query.

**Request Body (`WispQueryRequestDto`):**
```json
{
  "episodeId": "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
  "playbackPositionMs": 45000,
  "actionType": "entity_explain",
  "prompt": "Who is the commander on the tower?",
  "profileMode": "quick_glance",
  "profileId": "11111111-1111-1111-1111-111111111111"
}
```

**Supported Action Types (`WispActionType`):**
- `contextual_qa`: General questions about current scene events.
- `entity_explain`: Explains a character, tech artifact, faction, or organization.
- `scene_explain`: Explains what just happened in the current scene.
- `episode_recap`: Catch-up summary from episode start up to `playbackPositionMs`.
- `post_watch_quiz`: Generates a 4-option trivia question based strictly on verified past scenes.

**Success Response (`200 OK`):**
```json
{
  "headline": "Thom — Defensive Commander",
  "body": "Thom is directing the Oude Kerk watchtower defenses while the team aligns the beacon.",
  "bulletPoints": [
    "Leading the terrestrial defense grid",
    "Operating under temporal synchronization orders"
  ],
  "spoilerSafeUpToMs": 45000,
  "profileMode": "quick_glance",
  "providerUsed": "groq",
  "cached": false,
  "latencyMs": 342,
  "followUpChips": [
    {
      "id": "chip-next-1",
      "label": "What weapon is Thom using?",
      "actionType": "entity_explain"
    },
    {
      "id": "chip-next-2",
      "label": "Why the Oude Kerk?",
      "actionType": "scene_explain"
    }
  ],
  "quizPayload": null
}
```

*When `actionType === "post_watch_quiz"`, `quizPayload` is populated:*
```json
{
  "quizPayload": {
    "question": "Where is the temporal beacon located?",
    "options": [
      "Oude Kerk Watchtower",
      "Rijksmuseum Vault",
      "Centraal Station Bunker",
      "Dam Square Monolith"
    ],
    "correctIndex": 0,
    "explanation": "Thom and Celia aligned the beacon atop the historic Oude Kerk tower in Amsterdam."
  }
}
```

---

#### 5.2 List Registered AI Features
- **Path:** `GET /api/v1/wisp/features`
- **Method:** `GET`
- **Auth Guard:** Public
- **Purpose:** Returns dynamically registered AI capabilities.

**Success Response (`200 OK`):**
```json
{
  "features": [
    "contextual_qa",
    "entity_explain",
    "scene_explain",
    "episode_recap",
    "post_watch_quiz"
  ]
}
```

---

### Module 6: Health & Operational Probes (`/api/v1/health`)

#### 6.1 Service Liveness Probe
- **Path:** `GET /api/v1/health`
- **Method:** `GET`
- **Auth Guard:** Public
- **Purpose:** Lightweight container/process ping.

**Success Response (`200 OK`):**
```json
{
  "status": "ok",
  "service": "wisp-backend",
  "timestamp": "2026-10-06T11:45:00.000Z"
}
```

---

#### 6.2 Service Readiness Probe
- **Path:** `GET /api/v1/health/readiness`
- **Method:** `GET`
- **Auth Guard:** Public (Lightweight) / Operator-Protected (Deep DB Probe)
- **Purpose:** Verifies operational readiness. Public requests return static configuration health without triggering database queries. Supplying `X-Operator-Token` runs a live database probe.

**Success Response (`200 OK`):**
```json
{
  "status": "ok",
  "service": "wisp-backend",
  "timestamp": "2026-10-06T11:45:00.000Z",
  "database": "connected"
}
```

---

## 5. TypeScript Contract Definitions for Frontend

Copy and paste these interfaces directly into `frontend/src/types/api.ts`:

```typescript
export enum WispActionType {
  CONTEXTUAL_QA = 'contextual_qa',
  ENTITY_EXPLAIN = 'entity_explain',
  SCENE_EXPLAIN = 'scene_explain',
  EPISODE_RECAP = 'episode_recap',
  POST_WATCH_QUIZ = 'post_watch_quiz',
}

export enum HouseholdProfileMode {
  QUICK_GLANCE = 'quick_glance',
  DEEP_LORE = 'deep_lore',
  FAMILY_FRIENDLY = 'family_friendly',
}

export interface QuickActionChipItem {
  id?: string;
  label: string;
  actionType: WispActionType | string;
}

export interface ViewingProfile {
  id: string;
  device_id: string;
  display_name: string;
  mode: HouseholdProfileMode;
  spoiler_strictness: 'strict' | 'moderate' | 'off';
  voice_tts_enabled: boolean;
  avatar_color?: string;
  last_active_at: string;
}

export interface Stage1BootstrapResponse {
  profile: ViewingProfile | null;
  active_scene: {
    scene_index: number;
    title: string;
    scene_title: string;
    location_name?: string;
    start_time_ms: number;
    end_time_ms: number;
    summary: string;
    spoiler_safe_summary: string;
    quick_action_chips: QuickActionChipItem[];
  } | null;
  prewarmed_cards: Array<{
    action_type: string;
    provider: string;
    card: WispResponseCardDto;
  }>;
  session: {
    session_id: string;
    current_playback_ms: number;
    recent_turn_count: number;
    last_summary?: string;
    pinned_timestamps: number[];
  } | null;
  safe_playback_ms: number;
  episode_duration_ms: number;
}

export interface WispResponseCardDto {
  headline: string;
  body: string;
  bulletPoints?: string[];
  spoilerSafeUpToMs: number;
  profileMode: HouseholdProfileMode;
  providerUsed: string;
  cached: boolean;
  latencyMs: number;
  followUpChips: QuickActionChipItem[];
  quizPayload?: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  } | null;
}

export interface PaginatedProgramsResponse {
  items: Array<{
    id: string;
    slug: string;
    title: string;
    genre: string;
    synopsis: string;
    release_year?: number;
    rating: string;
    poster_url?: string;
    backdrop_url?: string;
    episode_count?: number;
  }>;
  pagination: {
    limit: number;
    next_cursor: string | null;
    has_more: boolean;
  };
}
```

---

## 6. Fire TV Network Client Implementation Example

Recommended implementation for `frontend/src/services/api.client.ts`:

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EnvConfig } from '../config/env';
import { Stage1BootstrapResponse, WispResponseCardDto } from '../types/api';

class FireTvApiClient {
  private token: string | null = null;
  private deviceSecret: string | null = null;
  private deviceId: string = 'firetv-living-room-01';

  async init(): Promise<void> {
    this.token = await AsyncStorage.getItem('@wisp_device_token');
    this.deviceSecret = await AsyncStorage.getItem('@wisp_device_secret');
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const url = `${EnvConfig.apiBaseUrl}${path}`;
    let response = await fetch(url, { ...options, headers });

    // Handle token expiry transparently
    if (response.status === 401 && this.deviceSecret) {
      const renewed = await this.renewToken();
      if (renewed) {
        headers['Authorization'] = `Bearer ${this.token}`;
        response = await fetch(url, { ...options, headers });
      }
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(err.message || `Request failed with status ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  private async renewToken(): Promise<boolean> {
    try {
      const res = await fetch(`${EnvConfig.apiBaseUrl}/auth/device-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: this.deviceId,
          deviceSecret: this.deviceSecret,
        }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      this.token = data.token;
      await AsyncStorage.setItem('@wisp_device_token', data.token);
      return true;
    } catch {
      return false;
    }
  }

  // Fast-Path Stage-1 Bootstrap
  async fetchBootstrap(episodeId: string, playbackMs: number): Promise<Stage1BootstrapResponse> {
    return this.request<Stage1BootstrapResponse>(
      `/context/${episodeId}/bootstrap?playbackMs=${Math.floor(playbackMs)}`
    );
  }

  // Synthesize AI Card
  async queryWisp(payload: {
    episodeId: string;
    playbackPositionMs: number;
    actionType: string;
    prompt: string;
  }): Promise<WispResponseCardDto> {
    return this.request<WispResponseCardDto>('/wisp/query', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

export const api = new FireTvApiClient();
```

---

## 7. Change Management & Support

- **Backend Repository:** `@wisp/backend` (`backend/`)
- **API Spec Location:** `C:\Users\Mahi\Desktop\WISP_BACKEND_API_SPECIFICATION.md` & `docs/API_SPECIFICATION.md`
- **Friction Log:** [`docs/FRICTION_LOG.md`](file:///c:/Users/Mahi/Desktop/wisp/docs/FRICTION_LOG.md)
- **Breaking Changes Policy:** The backend team maintains zero unannounced breaking changes during active hackathon feature development. If a schema change occurs, it will be versioned or polyfilled via `@wisp/ai-engine`.
