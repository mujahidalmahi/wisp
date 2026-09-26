import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Backend: DTO Contracts, NestJS Modules & Endpoint Definitions', () => {
  const dtoSource = fs.readFileSync(
    path.resolve('backend/src/common/dto/wisp-query.dto.ts'),
    'utf8',
  );
  const aiControllerSource = fs.readFileSync(
    path.resolve('backend/src/modules/ai-gateway/ai-gateway.controller.ts'),
    'utf8',
  );
  const contextControllerSource = fs.readFileSync(
    path.resolve('backend/src/modules/context/context.controller.ts'),
    'utf8',
  );

  it('defines all required WispActionType and HouseholdProfileMode enum values in wisp-query.dto.ts', () => {
    for (const action of [
      'contextual_qa',
      'entity_explain',
      'scene_explain',
      'episode_recap',
      'post_watch_quiz',
    ]) {
      assert.ok(dtoSource.includes(action), `Missing actionType ${action} in DTO`);
    }

    for (const mode of ['quick_glance', 'deep_lore', 'family_friendly']) {
      assert.ok(dtoSource.includes(mode), `Missing profileMode ${mode} in DTO`);
    }
  });

  it('exposes GET /context/:episodeId, GET /wisp/features, and POST /wisp/query endpoints', () => {
    assert.ok(contextControllerSource.includes("@Get(':episodeId')"));
    assert.ok(aiControllerSource.includes("@Get('features')"));
    assert.ok(aiControllerSource.includes("@Post('query')"));
  });
});
