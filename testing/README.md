# Wisp Comprehensive Testing Suite (`testing/`)

This root `testing/` directory houses Wisp's multi-layer verification suites covering **AI Integration**, **Backend API**, **Fire TV 10-Foot Frontend**, **Supabase Database Schema/Seeds**, **Cloudflare Edge Gateway**, and **Full-Application End-to-End Flows**.

---

## Directory Structure

```text
testing/
├── README.md                                  # Testing architecture & command reference
├── package.json                               # @wisp/testing workspace configuration
├── tsconfig.json                              # TypeScript configuration
├── helpers/
│   └── mock-ai-adapter.ts                     # Deterministic test model adapters & fixtures
├── ai-integration/                            # 1. Modular AI Engine (@wisp/ai-engine) Tests
│   ├── temporal-spoiler-safety.test.ts        # Strict timestamp boundary & progressive reveal tests
│   ├── feature-pipelines.test.ts              # Contextual Q&A, Entity, Scene, Recap, Quiz & custom features
│   └── provider-routing-fallback.test.ts      # Multi-provider failover & 15s timestamp bucket caching
├── backend/                                   # 2. NestJS Backend & Context Service Tests
│   ├── dto-contract-validation.test.ts        # Request/Response contract & HouseholdMode validation
│   └── hybrid-context-service.test.ts         # Primary DB RPC vs standalone fallback resilience
├── frontend/                                  # 3. Fire TV 10-Foot UI, Theme & Remote Navigation Tests
│   ├── tv-theme-ergonomics.test.ts            # 10-foot typography (>=22sp), 5% overscan & focus ring checks
│   ├── remote-navigation-mapping.test.ts      # Fire TV remote D-pad & menu key event handling
│   └── client-offline-resilience.test.ts      # Client Stage-1 instant context fallback verification
├── database/                                  # 4. Supabase PostgreSQL Migrations & Seed Tests
│   └── schema-and-seeds.test.ts               # Verifies SQL tables, temporal indexes, RPCs & 3-genre seeds
├── cloudflare/                                # 5. Cloudflare Worker Edge Gateway Tests
│   └── edge-worker-routing.test.ts            # KV cache key bucketing, CORS headers & R2 media routes
└── full-application/                          # 6. Full-Application End-to-End & Validation Gate Tests
    ├── end-to-end-viewing-flow.test.ts        # Complete viewer journey across timestamps, modes & quizzes
    └── hackathon-validation-gate.test.ts      # Automated 7-Step Working-Feature Validation Gate (Section 8.1)
```

---

## Running Tests

```bash
# Run ALL test suites across all 6 categories
npm test

# Or run specific domain test suites:
npm --workspace=testing run test:ai
npm --workspace=testing run test:backend
npm --workspace=testing run test:frontend
npm --workspace=testing run test:database
npm --workspace=testing run test:cloudflare
npm --workspace=testing run test:e2e
```
