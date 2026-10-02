import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Database: Supabase PostgreSQL Migrations, Anti-Spoiler RPC & 3-Genre Seeds', () => {
  const schemaSql = fs.readFileSync(
    path.resolve('supabase/migrations/0001_initial_wisp_schema.sql'),
    'utf8',
  );
  const rpcSql = fs.readFileSync(
    path.resolve('supabase/migrations/0002_temporal_context_functions.sql'),
    'utf8',
  );
  const seedSql = fs.readFileSync(
    path.resolve('supabase/seed.sql'),
    'utf8',
  );

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
