# Wisp System Architecture

## 1. End-to-End Request Flow

```mermaid
sequenceDiagram
    autonumber
    participant Remote as Fire TV Remote (D-Pad)
    participant Client as Fire TV App (frontend)
    participant Edge as Cloudflare Worker (cloudflare)
    participant API as NestJS Backend (backend)
    participant Engine as Modular AI Engine (@wisp/ai-engine)
    participant DB as Supabase PostgreSQL (database)
    participant AI as AI Providers (Groq / Gemini / OpenRouter)

    Remote->>Client: Press Menu / Select at playbackPositionMs (02:15)
    Client->>Edge: GET /api/v1/context/:episodeId?playbackMs=135000
    Edge->>API: Forward if KV Miss
    API->>Engine: HybridContextSource.getSpoilerSafeContext()
    Engine->>DB: RPC get_spoiler_safe_context(episodeId, 135000) (or In-Memory Fallback)
    Note over Engine,DB: Enforces end_time_ms <= 135000<br/>& reveal_time_ms <= 135000
    Engine-->>Client: Stage-1 Instant Scene Header + 3 Quick Action Chips (<100ms)
    Remote->>Client: D-Pad Select Chip ("Why are they recreating the bridge memory?")
    Client->>Edge: POST /api/v1/wisp/query { episodeId, playbackPositionMs, actionType, profileMode }
    Edge->>API: Forward on KV Miss
    API->>Engine: WispAiEngine.execute(input)
    Engine->>Engine: Resolve Feature Module (SceneExplainerFeature)
    Engine->>AI: AiProviderRouter (Groq Primary -> Gemini -> OpenRouter -> Ollama)
    AI-->>Engine: Structured JSON Output
    Engine-->>Client: Formatted 10-Foot Wisp Card + Dynamic Follow-Up Chips
```

---

## 2. Architectural Layers & Branch Mapping

| Layer | Workspace / Directory | Dedicated Branch | Responsibility |
| :--- | :--- | :--- | :--- |
| **10-Foot TV Client** | `frontend/` | `client` | Video playback surface, D-pad focus management, Two-Stage Wisp overlay drawer, Household Profile mode switcher. |
| **Modular AI Engine** | `ai-engine/` (`@wisp/ai-engine`) | `ai-integration` | Framework-agnostic AI feature pipelines, LLM provider adapters/router, and pure-TS anti-spoiler temporal context engine (runs standalone or inside backend). |
| **Application API** | `backend/` | `server` | NestJS HTTP boundary, DTO validation, rate limiting, and Supabase wiring into `@wisp/ai-engine`. |
| **Edge Gateway & CDN** | `cloudflare/` | `server` | Cloudflare Worker KV caching by 15-second timestamp buckets, rate limiting, and R2 media streaming. |
| **Temporal Database** | `database/` | `server` | Supabase PostgreSQL schema, demo seeds, and deterministic `get_spoiler_safe_context` RPC. |
| **Docs & Playbooks** | `docs/`, `agents/` | `docs` | Proposal, architecture, API specs, Fire TV UX guide, Friction Log (10% bonus), and AI agent specifications. |

---

## 3. Multi-Provider AI Routing Matrix (`@wisp/ai-engine`)

| Priority | Adapter in `ai-engine` | Target Model | Role in Wisp |
| :--- | :--- | :--- | :--- |
| **1 (Primary)** | `GroqModelAdapter` | `llama-3.3-70b-versatile` | Sub-second token generation so TV remote clicks feel instantaneous. |
| **2 (Secondary)** | `GeminiModelAdapter` | `gemini-2.5-flash` | High-quota free tier with native `application/json` structured output. |
| **3 (Tertiary)** | `OpenRouterModelAdapter` | `meta-llama/llama-3.1-8b-instruct:free` | Resilient free-model fallback pool. |
| **4 (Local Dev)** | `OllamaModelAdapter` | `llama3.2:3b` | Offline development and zero-quota local verification. |
