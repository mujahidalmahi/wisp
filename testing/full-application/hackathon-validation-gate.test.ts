import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Full Application: Hackathon Submission Readiness & 7-Step Validation Gate', () => {
  it('verifies all required hackathon submission documents and friction logs exist and are non-empty', () => {
    const requiredDocs = [
      'README.md',
      'AGENTS.md',
      'CONTRIBUTING.md',
      'docs/PROPOSAL.md',
      'docs/ARCHITECTURE.md',
      'docs/API_SPEC.md',
      'docs/AI_ENGINE_GUIDE.md',
      'docs/FIRE_TV_UX_GUIDE.md',
      'docs/FRICTION_LOG.md',
      'docs/PRODUCT_FEEDBACK.md',
      'docs/HACKATHON_READINESS.md',
      'docs/branches/MAIN.md',
      'docs/branches/SERVER.md',
      'docs/branches/CLIENT.md',
      'docs/branches/AI_INTEGRATION.md',
      'docs/branches/TESTING.md',
      'docs/branches/DOCS.md',
    ];

    for (const docPath of requiredDocs) {
      const fullPath = path.resolve(docPath);
      assert.ok(fs.existsSync(fullPath), `Missing required document: ${docPath}`);
      const stat = fs.statSync(fullPath);
      assert.ok(stat.size > 100, `Document ${docPath} appears empty or incomplete`);
    }
  });

  it('verifies no AI provider API keys or secrets are hardcoded inside frontend/ source files', () => {
    const frontendFiles = [
      'frontend/src/App.tsx',
      'frontend/src/config/env.ts',
      'frontend/src/services/api.client.ts',
    ];

    for (const file of frontendFiles) {
      const content = fs.readFileSync(path.resolve(file), 'utf8');
      assert.ok(!content.includes('gsk_'), `Groq key prefix leaked in ${file}`);
      assert.ok(!content.includes('sk-or-v1-'), `OpenRouter key prefix leaked in ${file}`);
      assert.ok(
        !content.includes('SUPABASE_SERVICE_ROLE_KEY'),
        `Supabase service role key referenced in ${file}`,
      );
    }
  });
});
