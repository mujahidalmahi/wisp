import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Resolves a SQL asset that has lived under two different roots across branches.
 * `main` moved the Supabase project from `database/supabase` up to a top-level
 * `supabase/`, while this branch still carries the pre-move `database/` layout.
 * Probing both keeps the suite green on either side of that merge instead of
 * failing on a path that no longer exists.
 */
function readSqlAsset(...candidates: string[]): string {
  for (const candidate of candidates) {
    const resolved = path.resolve(repositoryRoot, candidate);
    if (fs.existsSync(resolved)) {
      return fs.readFileSync(resolved, 'utf8');
    }
  }

  throw new Error(
    `Could not locate a SQL asset; tried: ${candidates.join(', ')} (root: ${repositoryRoot})`,
  );
}

describe('Database: Supabase PostgreSQL Migrations, Anti-Spoiler RPC & 3-Genre Seeds', () => {
  const schemaSql = readSqlAsset(
    'supabase/migrations/0001_initial_wisp_schema.sql',
    'database/migrations/0001_initial_wisp_schema.sql',
  );
  const rpcSql = readSqlAsset(
    'supabase/migrations/0002_temporal_context_functions.sql',
    'database/migrations/0002_temporal_context_functions.sql',
  );
  const seedSql = readSqlAsset('supabase/seed.sql', 'database/seeds/seed_demo_catalog.sql');

  it('defines all core production tables and temporal composite indexes', () => {
    const requiredTables = [
      'public.profiles',
      'public.programs',
      'public.episodes',
      'public.scene_contexts',
      'public.transcript_segments',
      'public.entities',
      'public.entity_appearances',
      'public.ai_response_cache',
      'public.interaction_history',
    ];
    for (const tbl of requiredTables) {
      assert.ok(schemaSql.includes(tbl), `Missing table ${tbl} in 0001_initial_wisp_schema.sql`);
    }

    assert.ok(schemaSql.includes('idx_scene_contexts_temporal'));
    assert.ok(schemaSql.includes('idx_transcript_segments_temporal'));
    assert.ok(schemaSql.includes('idx_entity_appearances_temporal'));
  });

  it('enforces end_time_ms <= p_playback_ms and reveal_time_ms <= p_playback_ms inside get_spoiler_safe_context RPC', () => {
    assert.ok(rpcSql.includes('create or replace function public.get_spoiler_safe_context'));
    assert.ok(rpcSql.includes('ts.end_time_ms <= p_playback_ms'));
    assert.ok(rpcSql.includes('ea.reveal_time_ms <= p_playback_ms'));
  });

  it('seeds all 3 demo genres (Sci-Fi, Science Documentary, Mystery)', () => {
    assert.ok(seedSql.includes('tears-of-steel'));
    assert.ok(seedSql.includes('cosmic-origins-webb'));
    assert.ok(seedSql.includes('midnight-express-mystery'));
  });
});
