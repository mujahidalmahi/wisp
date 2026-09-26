# Wisp Agent Playbooks & Runtime Prompt Library

This directory houses two categories of agent artifacts:

1. **`playbooks/`**: Specialized role definitions mapped to Wisp's repository branches:
   - [`ai-engine-agent.md`](./playbooks/ai-engine-agent.md) — `ai-integration` branch (`ai-engine/`)
   - [`fire-tv-ui-agent.md`](./playbooks/fire-tv-ui-agent.md) — `client` branch (`frontend/`)
   - [`backend-ai-gateway-agent.md`](./playbooks/backend-ai-gateway-agent.md) — `server` branch (`backend/`, `database/`, `cloudflare/`)
   - [`testing-qa-agent.md`](./playbooks/testing-qa-agent.md) — `testing` branch (`testing/`)
   - [`content-curation-agent.md`](./playbooks/content-curation-agent.md) — `server` & `ai-integration` branches (`database/seeds/`, `ai-engine/src/context/`)
2. **`prompts/`**: Versioned system prompt specifications implemented by the feature modules inside [`ai-engine/src/features/`](../ai-engine/src/features/).
