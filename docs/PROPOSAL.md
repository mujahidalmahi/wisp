# WISP — Refined Project Proposal

> **AI-Powered Contextual Viewing for Amazon Fire TV**
> *"A little more, when you need it."*

- **Track:** Fire TV (Amazon Developer Hackathon 2026)
- **Primary Platform:** Fire OS (with Vega OS architectural compatibility)
- **Frontend (`client`):** React Native (`react-native-tvos`) + TypeScript
- **Modular AI Engine (`ai-integration`):** `@wisp/ai-engine` (Standalone TypeScript AI feature pipelines, provider router & anti-spoiler temporal filter)
- **Backend API (`server`):** NestJS + TypeScript
- **Edge & Media Delivery (`server`):** Cloudflare Workers + KV Cache + R2 Storage
- **Database (`server`):** Supabase PostgreSQL (with deterministic temporal anti-spoiler RPC)
- **AI Providers:** Groq (Primary ultra-low latency), Google Gemini Flash, OpenRouter, Ollama (Local Dev Fallback)

---

## 1. Executive Summary

**Wisp** is a Fire TV application centered on **AI-powered contextual understanding during television viewing**. It helps viewers understand characters, relationships, terminology, and spoiler-safe recaps of what they are actively watching without leaving the viewing experience or reaching for a phone.

Unlike a generic chatbot, Wisp is built around the **10-foot television interface**:
1. **Zero-Typing Dynamic Action Chips:** Invoking Wisp with the Fire TV remote opens a `<100ms` local scene card with 3–4 context-specific, D-pad selectable questions—eliminating tedious on-screen keyboard typing.
2. **Deterministic Anti-Spoiler Windowing:** Both the PostgreSQL database (`get_spoiler_safe_context`) and the standalone `@wisp/ai-engine` temporal filter strictly bound transcript segments, scene summaries, and progressive character facts up to `playbackPositionMs` (`00:00 → current_playback_ms`), guaranteeing zero future plot spoilers.
3. **Household Viewing Modes:** Viewers can toggle between `Quick Glance` (1–2 sentence couch-readable summary), `Deep Lore` (detailed lore/scientific breakdown), and `Family Mode` (kid-friendly explanations).
4. **Decoupled Modular AI Segment (`@wisp/ai-engine`):** AI features and provider integrations are encapsulated in a zero-dependency workspace so AI capabilities can be built, tested, and verified independently of the backend server and database.

Every feature adheres to a strict engineering discipline: **no dummy AI responses, fake buttons, or hardcoded outputs**.

---

## 2. Core User Interaction Flow (Two-Stage Instant UI)

1. **Watch:** The viewer selects a program from the curated 3-genre catalog (*Sci-Fi*, *Science Documentary*, *Mystery*) and begins playback.
2. **Invoke (Stage 1 — `<100ms`):** The viewer presses **Menu** or **Select** on the Fire TV remote. Wisp immediately displays the active scene header, spoiler-safe timestamp badge (`SPOILER-SAFE LOCK @ 02:15`), and 3–4 zero-typing D-pad action chips.
3. **Select Action (Stage 2 — Grounded AI):** The viewer clicks a chip (e.g., *"Why are they recreating the bridge memory?"*).
4. **Temporal Context & AI Routing:** NestJS delegates to `@wisp/ai-engine`, resolving spoiler-safe context (`end_time_ms <= playback_position_ms`) and routing the feature prompt to **Groq** (with automatic fallback to **Gemini Flash** → **OpenRouter** → **Ollama**).
5. **Continue Exploring or Resume:** Wisp renders a distance-readable 10-foot card with 2–3 follow-up chips. Pressing **Back** returns focus cleanly to playback.

---

## 3. Working-Feature Validation Gate

Every capability must pass all 7 checks before completion:
1. Invokable on the Fire TV interface via D-pad remote.
2. Request reaches the real NestJS / Cloudflare Edge backend (or standalone `@wisp/ai-engine` harness during isolated testing).
3. System retrieves real temporal context bounded by `playbackPositionMs`.
4. Request reaches a real AI provider (or validated local Ollama model).
5. Returned JSON payload is consumed dynamically by the client.
6. Result is readable from 10 feet on the Fire TV simulator/device.
7. Failure states (rate limits, offline) degrade gracefully without faking success.
