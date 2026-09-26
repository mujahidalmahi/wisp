# Branch Guide: `server` — Role Category I (Backend, Database & Security)

- **Role Category:** `01 — Backend, Database & Security`
- **Assigned Team Members:** **Ashraful Araf Sami**, **Mujahid Al Mahi**
- **Primary Workspaces:** [`backend/`](../../backend/README.md), [`database/`](../../database/README.md), [`cloudflare/`](../../cloudflare/README.md)

---

## 1. Category Mandate
Own the server-side foundation of Wisp, including application APIs, business logic, persistent data, secure configuration, service boundaries, Cloudflare edge caching, and security controls.

---

## 2. Principal Deliverables
- Working NestJS backend service and REST API layer (`/api/v1/health`, `/api/v1/context/:episodeId`, `/api/v1/wisp/features`, `/api/v1/wisp/query`).
- Production-oriented Supabase PostgreSQL schema (`0001_initial_wisp_schema.sql`), deterministic anti-spoiler RPC (`0002_temporal_context_functions.sql`), and 3-genre demo seeds (`seed_demo_catalog.sql`).
- Secure server-side application boundary for AI services (`HybridContextSource` + `AiGatewayService`).
- Documented API contracts, error behavior, security controls, and deployment instructions.

---

## 3. Dependencies & Coordination Matrix

| Working Relationship | Required Coordination |
| :--- | :--- |
| **AI Integration (`ai-integration`)** | Provide secure context/data services (`HybridContextSource`), AI gateway boundaries, validation, rate limits, and provider-facing backend interfaces. |
| **Frontend, UI/UX (`client`)** | Provide stable endpoints, payload definitions (`wisp-query.dto.ts`), session behavior, errors, and integration requirements. |
| **QA & Testing (`testing`)** | Provide testable endpoints, representative seed data, error scenarios, and timely defect fixes. |
| **Research & Documentation (`docs`)** | Provide architecture, schema, API, security, configuration, and deployment information. |

---

## 4. Development & Verification Commands
```bash
npm run dev:backend
npm run dev:edge
npm run test:backend
npm run test:database
npm run test:cloudflare
```
