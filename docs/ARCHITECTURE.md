# Wisp System Architecture

## 1. End-to-End Request Flow

```mermaid
sequenceDiagram
    autonumber
    participant Remote as Fire TV Remote (D-Pad)
    participant Client as Fire TV App (React Native)
    participant Edge as Cloudflare Worker (KV Cache / R2)
    participant API as NestJS Backend & AI Gateway
    participant DB as Supabase PostgreSQL
    participant AI as AI Providers (Groq / Gemini / OpenRouter)

    Remote->>Client: Press Menu / Select at playbackPositionMs (02:15)
    Client->>Edge: GET /api/v1/context/:episodeId?playbackMs=135000
    Edge->>API: Forward if KV Miss
    API->>DB: RPC get_spoiler_safe_context(episodeId, 135000)
    Note over DB: Enforces end_time_ms <= 135000<br/>& reveal_time_ms <= 135000
    DB-->>Client: Stage-1 Instant Scene Header + 3 Quick Action Chips (<100ms)
    Remote->>Client: D-Pad Select Chip ("Why are they recreating the bridge memory?")
    Client->>Edge: POST /api/v1/wisp/query { episodeId, playbackPositionMs, actionType, profileMode }
    Edge->>API: Forward on KV Miss
    API->>DB: Fetch Temporal Context (00:00 -> 02:15)
    API->>AI: Grounded JSON Prompt (Groq Primary -> Gemini -> OpenRouter -> Ollama)
    AI-->>API: Structured Card + Dynamic Follow-Up Chips
    API-->>Client: Render 10-Foot Wisp Card + Focus First Follow-Up Chip
```

---

## 2. Architectural Layers

| Layer | Technology | Responsibility |
| :--- | :--- | :--- |
| **10-Foot TV Client** | React Native (`react-native-tvos`) + TS | Video playback surface, D-pad focus management, Two-Stage Wisp overlay drawer, Household Profile mode switcher. |
| **Edge Gateway & CDN** | Cloudflare Workers + KV + R2 | Edge caching by 15-second timestamp buckets, rate limiting, and zero-egress R2 streaming for open-movie demo videos. |
| **Application API & AI Gateway** | NestJS + TypeScript | Input validation, rate limiting, provider routing/fallback, prompt shaping by household profile mode, and JSON schema normalization. |
| **Temporal Context Database** | Supabase PostgreSQL | Stores programs, episodes, scenes, timestamped transcripts, progressive entity lore reveals, and deterministic anti-spoiler SQL functions. |

---

## 3. Multi-Provider AI Routing Matrix

| Priority | Provider | Target Model | Role in Wisp |
| :--- | :--- | :--- | :--- |
| **1 (Primary)** | **Groq** | `llama-3.3-70b-versatile` | Sub-second token generation so TV remote clicks feel instantaneous. |
| **2 (Secondary)** | **Google Gemini** | `gemini-2.5-flash` | High-quota free tier with native `application/json` structured output. |
| **3 (Tertiary)** | **OpenRouter** | `meta-llama/llama-3.1-8b-instruct:free` | Resilient free-model fallback pool. |
| **4 (Local Dev)** | **Ollama** | `llama3.2:3b` | Offline development and zero-quota local verification. |
