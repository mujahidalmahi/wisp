# Wisp Backend (NestJS + TypeScript)

The Wisp backend acts as the secure boundary between the **Fire TV React Native client**, **Supabase PostgreSQL**, and external **AI Providers** (`Groq`, `Gemini`, `OpenRouter`, and local `Ollama`).

## Responsibilities

1. **Credential Isolation**: No AI provider API keys are shipped in the Fire TV APK.
2. **Deterministic Anti-Spoiler Context Retrieval**: Queries `get_spoiler_safe_context()` in Supabase so future dialogue or character twists after `playbackPositionMs` are never sent to the LLM.
3. **Multi-Provider Routing & Fallback**:
   - **Primary**: `Groq` (ultra-low latency for responsive 10-foot TV card rendering)
   - **Secondary**: `Google Gemini Flash`
   - **Tertiary**: `OpenRouter` (free-tier models)
   - **Local Dev Fallback**: `Ollama`
4. **Household Viewing Mode Shaping**: Adapts explanation depth (`quick_glance`, `deep_lore`, `family_friendly`) and returns 2–3 dynamic follow-up action chips for zero-typing remote navigation.
