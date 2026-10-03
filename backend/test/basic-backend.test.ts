import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ConfigService } from '@nestjs/config';

import { CatalogService } from '../dist/modules/catalog/catalog.service.js';
import { ProfilesService } from '../dist/modules/profiles/profiles.service.js';
import { ContextService } from '../dist/modules/context/context.service.js';
import { ContextController } from '../dist/modules/context/context.controller.js';
import { ProfilesController } from '../dist/modules/profiles/profiles.controller.js';
import { SupabaseService } from '../dist/modules/supabase/supabase.service.js';
import { HealthController } from '../dist/modules/health/health.controller.js';
import { ParseSlugPipe } from '../dist/common/pipes/parse-slug.pipe.js';
import { DeviceAuthGuard } from '../dist/common/guards/device-auth.guard.js';
import { DeviceTokenService } from '../dist/common/auth/device-token.service.js';
import { AuthController } from '../dist/modules/auth/auth.controller.js';
import { validateEnvironment } from '../dist/common/config/environment.validator.js';
import { GlobalHttpExceptionFilter } from '../dist/common/filters/http-exception.filter.js';

import { GetProgramsQueryDto } from '../dist/modules/catalog/dto/get-programs-query.dto.js';
import { CreateProfileDto } from '../dist/modules/profiles/dto/create-profile.dto.js';
import { UpdateProfileDto } from '../dist/modules/profiles/dto/update-profile.dto.js';
import { GetProfilesQueryDto } from '../dist/modules/profiles/dto/get-profiles-query.dto.js';
import { GetContextQueryDto } from '../dist/modules/context/dto/get-context-query.dto.js';
import { GetBootstrapQueryDto } from '../dist/modules/context/dto/get-bootstrap-query.dto.js';
import { HouseholdProfileMode } from '../dist/common/dto/wisp-query.dto.js';

/**
 * Mock helper to create a configured SupabaseService simulating production database responses
 */
function createMockSupabaseService(handlers: {
  from?: (table: string) => any;
  rpc?: (name: string, params: any) => Promise<{ data: any; error: any }>;
}) {
  const service = Object.create(SupabaseService.prototype);
  (service as any).logger = { log: () => {}, warn: () => {}, error: () => {} };
  (service as any).isConfiguredFlag = true;
  (service as any).client = {
    from: handlers.from || (() => ({ select: () => ({}) })),
    rpc: handlers.rpc || (async () => ({ data: null, error: null })),
  };
  service.isConfigured = () => true;
  service.getClient = () => (service as any).client;
  service.isTransientError = SupabaseService.prototype.isTransientError;
  (service as any).recordOperation = () => {};
  service.executeWithRetry = SupabaseService.prototype.executeWithRetry.bind(service);
  service.executeRpc = SupabaseService.prototype.executeRpc.bind(service);
  service.checkHealth = SupabaseService.prototype.checkHealth.bind(service);
  return service as SupabaseService;
}

describe('Phase 1 Basic Backend: Catalog Module (In-Memory Fallback Path)', () => {
  const config = new ConfigService({});
  const supabase = new SupabaseService(config);
  const catalog = new CatalogService(supabase);

  it('lists active programs with cursor pagination and sorting', async () => {
    const res = await catalog.listPrograms({ limit: 2, order: 'asc' });
    assert.ok(res.items);
    assert.ok(Array.isArray(res.items));
    assert.equal(res.items.length, 2);
    assert.ok(res.pagination);
    assert.equal(res.pagination.limit, 2);
    assert.equal(typeof res.pagination.has_more, 'boolean');
    assert.ok(res.items[0].title.localeCompare(res.items[1].title) <= 0);

    // If next_cursor exists, follow cursor to next page
    if (res.pagination.next_cursor) {
      const page2 = await catalog.listPrograms({ limit: 2, cursor: res.pagination.next_cursor });
      assert.ok(page2.items.length >= 1);
      assert.notEqual(page2.items[0].id, res.items[0].id);
    }
  });

  it('filters programs by genre with case insensitivity', async () => {
    const res = await catalog.listPrograms({ genre: 'sci-fi' });
    assert.ok(res.items.some((p: any) => p.slug === 'tears-of-steel'));
    assert.ok(!res.items.some((p: any) => p.slug === 'cosmic-origins'));
  });

  it('searches programs by query and safely strips PostgREST injection tokens (Item 3)', async () => {
    const searched = await catalog.listPrograms({ q: 'Amsterdam' });
    assert.equal(searched.items.length, 1);
    assert.equal(searched.items[0].slug, 'tears-of-steel');
    assert.equal(searched.items[0].episode_count, 2);

    // Malicious PostgREST filter injection attempt should be stripped safely without throwing
    const injectionAttempt = await catalog.listPrograms({ q: 'Amsterdam"(),:;--' });
    assert.equal(injectionAttempt.items.length, 1);
    assert.equal(injectionAttempt.items[0].slug, 'tears-of-steel');
  });

  it('fetches program by slug with published episodes and episode sibling pointers', async () => {
    const program = await catalog.getProgramBySlug('tears-of-steel');
    assert.equal(program.slug, 'tears-of-steel');
    assert.ok(Array.isArray(program.episodes));
    assert.ok(program.episodes.length >= 2);
    assert.equal(program.episodes[0].season_number, 1);
    assert.equal(program.episodes[0].episode_number, 1);
    assert.equal(program.episodes[0].next_episode_id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2');
    assert.equal(program.episodes[1].prev_episode_id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1');
  });

  it('throws 404 for unknown program slug', async () => {
    await assert.rejects(
      async () => catalog.getProgramBySlug('non-existent-slug-xyz'),
      { name: 'NotFoundException' },
    );
  });

  it('fetches playable episode with program_title, program_slug, and sibling pointers (Item 9)', async () => {
    const ep = await catalog.getEpisodeById('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1');
    assert.equal(ep.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1');
    assert.equal(ep.title, 'The Amsterdam Calibration');
    assert.equal(ep.duration_ms, 734000);
    assert.equal(ep.program_title, 'Tears of Steel');
    assert.equal(ep.program_slug, 'tears-of-steel');
    assert.equal(ep.next_episode_id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2');
    assert.equal(ep.prev_episode_id, null);
    assert.ok(ep.video_stream_url.startsWith('https://'));
  });

  it('throws 404 for unknown episode ID', async () => {
    await assert.rejects(
      async () => catalog.getEpisodeById('00000000-0000-0000-0000-000000000000'),
      { name: 'NotFoundException' },
    );
  });
});

describe('Phase 1 Basic Backend: Configured Database Path & Strict Fallback Boundary (Items 3, 5, 9)', () => {
  it('returns empty array and does NOT fall back to fixtures when DB returns empty list (Item 5)', async () => {
    const mockSupabase = createMockSupabaseService({
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    });
    const catalog = new CatalogService(mockSupabase);
    const res = await catalog.listPrograms({ limit: 10 });
    assert.deepEqual(res.items, []);
    assert.equal(res.pagination.has_more, false);
    assert.equal(res.pagination.next_cursor, null);
  });

  it('preserves 404 NotFoundException on program slug miss when DB is configured (Item 5)', async () => {
    const mockSupabase = createMockSupabaseService({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: { code: 'PGRST116', message: 'No rows' } }),
            }),
          }),
        }),
      }),
    });
    const catalog = new CatalogService(mockSupabase);
    // Even if 'tears-of-steel' is in fixtures, DB miss must throw 404
    await assert.rejects(
      async () => catalog.getProgramBySlug('tears-of-steel'),
      { name: 'NotFoundException' },
    );
  });

  it('preserves 404 NotFoundException on episode ID miss when DB is configured (Item 5)', async () => {
    const mockSupabase = createMockSupabaseService({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({ data: null, error: { code: 'PGRST116', message: 'No rows' } }),
            }),
          }),
        }),
      }),
    });
    const catalog = new CatalogService(mockSupabase);
    await assert.rejects(
      async () => catalog.getEpisodeById('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'),
      { name: 'NotFoundException' },
    );
  });

  it('populates program_title and program_slug from joined database relation (Item 9)', async () => {
    const mockSupabase = createMockSupabaseService({
      from: (table) => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: 'ep-db-1',
                  program_id: 'prog-db-1',
                  season_number: 1,
                  episode_number: 1,
                  title: 'Database Episode',
                  summary: 'Episode from DB',
                  duration_ms: 600000,
                  video_stream_url: 'https://example.com/stream.mp4',
                  is_published: true,
                  programs: { title: 'DB Program Title', slug: 'db-program-slug' },
                },
                error: null,
              }),
              order: () => ({
                order: async () => ({
                  data: [{ id: 'ep-db-1', season_number: 1, episode_number: 1 }],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    });
    const catalog = new CatalogService(mockSupabase);
    const ep = await catalog.getEpisodeById('ep-db-1');
    assert.equal(ep.program_title, 'DB Program Title');
    assert.equal(ep.program_slug, 'db-program-slug');
    assert.equal(ep.prev_episode_id, null);
    assert.equal(ep.next_episode_id, null);
  });
});

describe('Phase 1 Basic Backend: Household Profiles Module', () => {
  const config = new ConfigService({});
  const supabase = new SupabaseService(config);
  const profiles = new ProfilesService(supabase);

  it('resolves household profiles for an Amazon Fire TV device', async () => {
    const list = await profiles.getProfilesByDeviceId('firetv-demo-device-01');
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 2);
    assert.equal(list[0].device_id, 'firetv-demo-device-01');
  });

  it('creates and upserts a household viewing profile', async () => {
    const created = await profiles.createProfile(
      {
        deviceId: 'firetv-test-device-99',
        displayName: 'Guest Room TV',
        mode: HouseholdProfileMode.DEEP_LORE,
        spoilerStrictness: 'strict',
        voiceTtsEnabled: true,
      },
      'firetv-test-device-99',
    );
    assert.ok(created.id);
    assert.equal(created.device_id, 'firetv-test-device-99');
    assert.equal(created.display_name, 'Guest Room TV');
    assert.equal(created.mode, HouseholdProfileMode.DEEP_LORE);
    assert.equal(created.voice_tts_enabled, true);

    const retrieved = await profiles.getProfilesByDeviceId('firetv-test-device-99');
    assert.equal(retrieved.length, 1);
    assert.equal(retrieved[0].display_name, 'Guest Room TV');
  });

  it('enforces device-ownership on profile updates (Item 1)', async () => {
    // Valid update from the owning device
    const updated = await profiles.updateProfile(
      '11111111-1111-1111-1111-111111111111',
      { mode: HouseholdProfileMode.FAMILY_FRIENDLY, voiceTtsEnabled: true },
      'firetv-demo-device-01',
    );
    assert.equal(updated.mode, HouseholdProfileMode.FAMILY_FRIENDLY);

    // Mismatched device attempting mutation must be rejected with 403 Forbidden
    await assert.rejects(
      async () =>
        profiles.updateProfile(
          '11111111-1111-1111-1111-111111111111',
          { displayName: 'Hacked Profile' },
          'unauthorized-rogue-device',
        ),
      { name: 'ForbiddenException' },
    );
  });

  it('enforces device-ownership on touchProfile (Item 1)', async () => {
    const touched = await profiles.touchProfile(
      '11111111-1111-1111-1111-111111111111',
      'firetv-demo-device-01',
    );
    assert.ok(touched.last_active_at);

    await assert.rejects(
      async () =>
        profiles.touchProfile('11111111-1111-1111-1111-111111111111', 'wrong-device-id'),
      { name: 'ForbiddenException' },
    );
  });

  it('throws 404 when updating non-existent profile', async () => {
    await assert.rejects(
      async () =>
        profiles.updateProfile(
          '99999999-9999-9999-9999-999999999999',
          { displayName: 'Ghost' },
          'firetv-demo-device-01',
        ),
      { name: 'NotFoundException' },
    );
  });

  it('prevents deleting the sole viewing profile on a device (Item 11)', async () => {
    await assert.rejects(
      async () => {
        // device-99 only has 1 profile created above
        const profilesOn99 = await profiles.getProfilesByDeviceId('firetv-test-device-99');
        assert.equal(profilesOn99.length, 1);
        await profiles.deleteProfile(profilesOn99[0].id, 'firetv-test-device-99');
      },
      { name: 'BadRequestException' },
    );
  });

  it('rejects deletion when deviceId does not own the profile (Item 1)', async () => {
    await assert.rejects(
      async () =>
        profiles.deleteProfile('22222222-2222-2222-2222-222222222222', 'wrong-device-999'),
      { name: 'ForbiddenException' },
    );
  });

  it('enforces atomic sole-profile check in database path (Item 11)', async () => {
    const mockSupabase = createMockSupabaseService({
      from: () => ({
        select: (_fields: any, opts: any) => {
          if (opts && opts.count === 'exact') {
            return {
              eq: async () => ({ count: 1, data: null, error: null }),
            };
          }
          return {
            eq: () => ({
              single: async () => ({
                data: { id: 'prof-sole', device_id: 'dev-atomic' },
                error: null,
              }),
            }),
          };
        },
        delete: () => ({
          eq: () => ({
            eq: async () => ({ error: null }),
          }),
        }),
      }),
    });
    const dbProfiles = new ProfilesService(mockSupabase);
    await assert.rejects(
      async () => dbProfiles.deleteProfile('prof-sole', 'dev-atomic'),
      { name: 'BadRequestException' },
    );
  });
});

describe('Phase 1 Basic Backend: Temporal Context & Stage-1 Bootstrap', () => {
  const config = new ConfigService({});
  const supabase = new SupabaseService(config);
  const catalog = new CatalogService(supabase);
  const profiles = new ProfilesService(supabase);
  const context = new ContextService(supabase, catalog, profiles);

  it('returns spoiler-safe context bounded by playbackPositionMs and propagates lookbackMs (Item 6)', async () => {
    const res = await context.getSpoilerSafeContext(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      45000,
      180000,
    );
    assert.ok(res);
    assert.equal(res.metadata.playback_position_ms, 45000);
    assert.equal(res.metadata.program_title, 'Tears of Steel');
    assert.ok(res.active_scene);
    assert.ok(res.active_scene.quick_action_chips.length >= 2);
  });

  it('clamps negative playbackPositionMs to 0 safely', async () => {
    const res = await context.getSpoilerSafeContext('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', -5000);
    assert.ok(res);
    assert.equal(res.metadata.playback_position_ms, 0);
  });

  it('returns Stage-1 Fire TV Bootstrap bundle with verified profile, actual episode duration, and null session (Item 7)', async () => {
    const boot = await context.getFireTvBootstrap(
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
      'firetv-demo-device-01',
      45000,
      '11111111-1111-1111-1111-111111111111',
    );
    assert.ok(boot);
    assert.ok(boot.profile);
    assert.equal(boot.profile.id, '11111111-1111-1111-1111-111111111111');
    assert.ok(boot.active_scene);
    assert.ok(boot.active_scene.quick_action_chips.length >= 2, 'Must have at least 2 Quick Action Chips');
    assert.ok(Array.isArray(boot.prewarmed_cards));
    assert.equal(boot.safe_playback_ms, 45000);
    assert.equal(boot.episode_duration_ms, 734000); // from actual episode data
    assert.equal(boot.session, null); // never fabricates fake session in fallback
  });

  it('rejects bootstrap when requested profileId does not belong to deviceId in fallback (Item 2)', async () => {
    await assert.rejects(
      async () =>
        context.getFireTvBootstrap(
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
          'unauthorized-alien-device',
          45000,
          '11111111-1111-1111-1111-111111111111',
        ),
      { name: 'ForbiddenException' },
    );
  });

  it('proves that lookbackMs explicitly reaches the database RPC (Item 6 & Inline Comment 2)', async () => {
    let capturedRpc: { name: string; params: any } | null = null;
    const mockSupabase = createMockSupabaseService({
      rpc: async (name, params) => {
        capturedRpc = { name, params };
        return {
          data: {
            metadata: {
              program_title: 'RPC Program',
              genre: 'Sci-Fi',
              episode_title: 'RPC Episode',
              season_number: 1,
              episode_number: 1,
              playback_position_ms: 60000,
            },
            active_scene: {
              scene_index: 1,
              scene_title: 'RPC Scene',
              location_name: 'Tower',
              spoiler_safe_summary: 'RPC Summary',
              quick_action_chips: [{ id: '1', label: 'Explain', actionType: 'scene_explain' }],
            },
            prior_scenes: [],
            recent_transcript: [],
            unlocked_entities: [],
          },
          error: null,
        };
      },
    });

    const rpcContext = new ContextService(mockSupabase, catalog, profiles);
    const result = await rpcContext.getSpoilerSafeContext('ep-uuid-1234', 60000, 300000);

    assert.ok(capturedRpc);
    assert.equal(capturedRpc.name, 'get_spoiler_safe_context');
    assert.equal(capturedRpc.params.p_episode_id, 'ep-uuid-1234');
    assert.equal(capturedRpc.params.p_playback_ms, 60000);
    assert.equal(capturedRpc.params.p_lookback_ms, 300000); // lookbackMs proven to reach database RPC!
    assert.equal(result.metadata.program_title, 'RPC Program');
  });

  it('proves bootstrap validates profile-to-device ownership against database (Item 2)', async () => {
    const mockSupabase = createMockSupabaseService({
      from: () => ({
        select: () => ({
          eq: (_col: string, val: string) => ({
            single: async () => {
              if (val === 'non-existent-profile-uuid') {
                return { data: null, error: { code: 'PGRST116', message: '0 rows' } };
              }
              return {
                data: { id: 'prof-db-1', device_id: 'authorized-device-abc' },
                error: null,
              };
            },
          }),
        }),
      }),
      rpc: async () => ({
        data: {
          profile: { id: 'prof-db-1', display_name: 'User 1' },
          active_scene: { quick_action_chips: [] },
          prewarmed_cards: [],
          session: null,
          safe_playback_ms: 10000,
          episode_duration_ms: 500000,
        },
        error: null,
      }),
    });

    const dbContext = new ContextService(mockSupabase, catalog, profiles);

    // Mismatched device must be rejected by database check
    await assert.rejects(
      async () =>
        dbContext.getFireTvBootstrap('ep-1', 'rogue-device-xyz', 10000, 'prof-db-1'),
      { name: 'ForbiddenException' },
    );

    // Matching device succeeds
    const boot = await dbContext.getFireTvBootstrap(
      'ep-1',
      'authorized-device-abc',
      10000,
      'prof-db-1',
    );
    assert.ok(boot);
    assert.equal(boot.profile?.id, 'prof-db-1');

    // Non-existent profileId fails fast with NotFoundException (404)
    await assert.rejects(
      async () =>
        dbContext.getFireTvBootstrap(
          'ep-1',
          'authorized-device-abc',
          10000,
          'non-existent-profile-uuid',
        ),
      { name: 'NotFoundException' },
    );
  });
});

describe('Phase 1 Basic Backend: SupabaseService Transient Error Classification & Retries (Item 12)', () => {
  const config = new ConfigService({});
  const supabase = new SupabaseService(config);

  it('classifies network, connection, and timeout errors as transient', () => {
    assert.equal(supabase.isTransientError(new Error('fetch failed: network error')), true);
    assert.equal(supabase.isTransientError(new Error('Connection reset by peer')), true);
    assert.equal(supabase.isTransientError({ code: '57P01', message: 'admin shutdown' }), true);
    assert.equal(supabase.isTransientError({ status: 503, message: 'Service Unavailable' }), true);
  });

  it('classifies 4xx and Postgres syntax/constraint errors as non-transient', () => {
    assert.equal(supabase.isTransientError({ status: 400, message: 'Bad Request' }), false);
    assert.equal(supabase.isTransientError({ status: 404, message: 'Not Found' }), false);
    assert.equal(supabase.isTransientError({ code: '23505', message: 'unique_violation' }), false);
    assert.equal(supabase.isTransientError({ code: '22P02', message: 'invalid_text_representation' }), false);
    assert.equal(supabase.isTransientError({ code: 'PGRST116', message: '0 rows returned' }), false);
  });

  it('retries transient errors up to maxRetries (Item 12)', async () => {
    let callCount = 0;
    const { error } = await supabase.executeWithRetry(
      async () => {
        callCount++;
        return { data: null, error: new Error('network timeout') };
      },
      { maxRetries: 2, initialDelayMs: 1 },
    );
    assert.ok(error);
    assert.equal(callCount, 3); // initial attempt + 2 retries
  });

  it('aborts immediately without retrying non-transient errors (Item 12)', async () => {
    let callCount = 0;
    const { error } = await supabase.executeWithRetry(
      async () => {
        callCount++;
        return { data: null, error: { status: 400, message: 'Bad Request' } };
      },
      { maxRetries: 2, initialDelayMs: 1 },
    );
    assert.ok(error);
    assert.equal(callCount, 1); // 0 retries, aborted on first attempt!
  });
});

describe('Phase 1 Basic Backend: Health Endpoint Separation (Item 16)', () => {
  const config = new ConfigService({});
  const supabase = new SupabaseService(config);
  const health = new HealthController(supabase);

  it('returns minimal public liveness without internal telemetry', () => {
    const liveness = health.getLiveness();
    assert.equal(liveness.status, 'ok');
    assert.equal(liveness.service, 'wisp-backend');
    assert.ok(liveness.timestamp);
    assert.equal((liveness as any).database, undefined);
  });

  it('returns sanitized readiness for public callers without leaking database diagnostics', async () => {
    const res: any = { status: () => res };
    const anonReadiness = await health.getReadiness(res);
    assert.ok(anonReadiness.status === 'ok' || anonReadiness.status === 'unhealthy');
    assert.equal(typeof anonReadiness.database, 'string');
    assert.equal((anonReadiness.database as any).metrics, undefined);
    assert.equal((anonReadiness.database as any).configured, undefined);
  });

  it('provides diagnostic metrics when authorized with INTERNAL_OPERATOR_TOKEN via header', async () => {
    const origToken = process.env.INTERNAL_OPERATOR_TOKEN;
    process.env.INTERNAL_OPERATOR_TOKEN = 'secret-test-operator-key-999';
    try {
      const res: any = { status: () => res };
      const operatorReadiness = await health.getReadiness(res, 'secret-test-operator-key-999');
      assert.ok(operatorReadiness.status === 'ok' || operatorReadiness.status === 'unhealthy');
      assert.equal(typeof operatorReadiness.database, 'object');
      assert.equal(operatorReadiness.database.configured, false);
      assert.ok(operatorReadiness.database.metrics);

      // Bearer scheme in Authorization header also accepted
      const bearerReadiness = await health.getReadiness(res, undefined, 'Bearer secret-test-operator-key-999');
      assert.equal(typeof bearerReadiness.database, 'object');
    } finally {
      process.env.INTERNAL_OPERATOR_TOKEN = origToken;
    }
  });

  it('fails closed: rejects operator header with 503 when operator token is unconfigured on server', async () => {
    const origInternal = process.env.INTERNAL_OPERATOR_TOKEN;
    const origOperator = process.env.OPERATOR_TOKEN;
    delete process.env.INTERNAL_OPERATOR_TOKEN;
    delete process.env.OPERATOR_TOKEN;
    try {
      const res: any = { status: () => res };
      await assert.rejects(
        async () => health.getReadiness(res, 'some-attempted-token'),
        { name: 'ServiceUnavailableException' },
      );
    } finally {
      process.env.INTERNAL_OPERATOR_TOKEN = origInternal;
      process.env.OPERATOR_TOKEN = origOperator;
    }
  });

  it('rejects invalid operator credentials with 401 UnauthorizedException', async () => {
    const origToken = process.env.INTERNAL_OPERATOR_TOKEN;
    process.env.INTERNAL_OPERATOR_TOKEN = 'secret-test-operator-key-999';
    try {
      const res: any = { status: () => res };
      await assert.rejects(
        async () => health.getReadiness(res, 'wrong-operator-key'),
        { name: 'UnauthorizedException' },
      );
    } finally {
      process.env.INTERNAL_OPERATOR_TOKEN = origToken;
    }
  });
});

describe('Phase 1 Basic Backend: Slug & Device Validation Pipes (Item 14)', () => {
  const pipe = new ParseSlugPipe();

  it('accepts valid kebab-case slugs', () => {
    assert.equal(pipe.transform('tears-of-steel'), 'tears-of-steel');
    assert.equal(pipe.transform('cosmos-laundromat-2015'), 'cosmos-laundromat-2015');
  });

  it('rejects invalid slug formats', () => {
    assert.throws(() => pipe.transform('Tears Of Steel'), { name: 'BadRequestException' });
    assert.throws(() => pipe.transform('slug with spaces'), { name: 'BadRequestException' });
    assert.throws(() => pipe.transform('slug_with_underscores'), { name: 'BadRequestException' });
    assert.throws(() => pipe.transform('slug/with/slashes'), { name: 'BadRequestException' });
    assert.throws(() => pipe.transform(''), { name: 'BadRequestException' });
  });
});

describe('Phase 1 Basic Backend: DTO Validation Guards (Item 14)', () => {
  it('rejects CreateProfileDto with whitespace-only required fields', async () => {
    const dto = plainToInstance(CreateProfileDto, {
      deviceId: '   ',
      displayName: '   ',
    });
    const errors = await validate(dto);
    assert.ok(errors.length >= 2);
    const properties = errors.map((e) => e.property);
    assert.ok(properties.includes('deviceId'));
    assert.ok(properties.includes('displayName'));
  });

  it('rejects GetContextQueryDto exceeding temporal upper bounds', async () => {
    // playbackMs > 24 hours (86400000ms)
    const dto1 = plainToInstance(GetContextQueryDto, { playbackMs: 999999999 });
    const errors1 = await validate(dto1);
    assert.ok(errors1.some((e) => e.property === 'playbackMs'));

    // lookbackMs > 1 hour (3600000ms)
    const dto2 = plainToInstance(GetContextQueryDto, { lookbackMs: 5000000 });
    const errors2 = await validate(dto2);
    assert.ok(errors2.some((e) => e.property === 'lookbackMs'));
  });

  it('validates clean GetBootstrapQueryDto with valid UUID and trimmed deviceId', async () => {
    const dto = plainToInstance(GetBootstrapQueryDto, {
      deviceId: '  dev-01  ',
      playbackMs: 5000,
      profileId: '11111111-1111-4111-a111-111111111111',
    });
    const errors = await validate(dto);
    assert.equal(errors.length, 0);
    assert.equal(dto.deviceId, 'dev-01');
  });

  it('rejects GetBootstrapQueryDto exceeding playbackMs upper bound', async () => {
    const dto = plainToInstance(GetBootstrapQueryDto, {
      deviceId: 'dev-01',
      playbackMs: 100000000,
    });
    const errors = await validate(dto);
    assert.ok(errors.some((e) => e.property === 'playbackMs'));
  });
});

describe('Phase 1 Basic Backend: DeviceAuthGuard Authorization Boundaries (Item 1)', () => {
  const tokenService = new DeviceTokenService();
  const guard = new DeviceAuthGuard(tokenService);

  function createMockContext(req: any) {
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as any;
  }

  it('authenticates via verifiable signed token in Authorization Bearer header', () => {
    const validToken = tokenService.signDeviceToken('firetv-4k-living-room');
    const req: any = {
      headers: { authorization: `Bearer ${validToken}` },
      query: {},
      body: {},
    };
    const res = guard.canActivate(createMockContext(req));
    assert.equal(res, true);
    assert.equal(req.deviceId, 'firetv-4k-living-room');
    assert.equal(req.devicePayload.deviceId, 'firetv-4k-living-room');
  });

  it('authenticates via verifiable signed token in Authorization Device header scheme', () => {
    const validToken = tokenService.signDeviceToken('firetv-bedroom');
    const req: any = {
      headers: { authorization: `Device ${validToken}` },
      query: {},
      body: {},
    };
    const res = guard.canActivate(createMockContext(req));
    assert.equal(res, true);
    assert.equal(req.deviceId, 'firetv-bedroom');
  });

  it('authenticates via verifiable signed token in X-Device-Token header', () => {
    const validToken = tokenService.signDeviceToken('firetv-guestroom');
    const req: any = {
      headers: { 'x-device-token': validToken },
      query: {},
      body: {},
    };
    const res = guard.canActivate(createMockContext(req));
    assert.equal(res, true);
    assert.equal(req.deviceId, 'firetv-guestroom');
  });

  it('rejects requests with forged or invalid cryptographic token signatures', () => {
    const validToken = tokenService.signDeviceToken('firetv-bedroom');
    const forgedToken = validToken.slice(0, -6) + 'badbad';
    const req: any = {
      headers: { authorization: `Bearer ${forgedToken}` },
      query: {},
      body: {},
    };
    assert.throws(
      () => guard.canActivate(createMockContext(req)),
      { name: 'UnauthorizedException' },
    );
  });

  it('rejects requests with expired device tokens', () => {
    // Generate token that expired 10 seconds ago
    const expiredToken = tokenService.signDeviceToken('firetv-expired', -10);
    const req: any = {
      headers: { authorization: `Bearer ${expiredToken}` },
      query: {},
      body: {},
    };
    assert.throws(
      () => guard.canActivate(createMockContext(req)),
      { name: 'UnauthorizedException' },
    );
  });

  it('rejects requests with malformed token structure', () => {
    const req: any = {
      headers: { authorization: 'Bearer invalid.token' },
      query: {},
      body: {},
    };
    assert.throws(
      () => guard.canActivate(createMockContext(req)),
      { name: 'UnauthorizedException' },
    );
  });

  it('rejects requests with no device identification credential in headers', () => {
    const req: any = {
      headers: {},
      query: {},
      body: {},
    };
    assert.throws(
      () => guard.canActivate(createMockContext(req)),
      { name: 'UnauthorizedException' },
    );
  });

  it('strictly rejects using query deviceId or body deviceId as authentication identity', () => {
    const req: any = {
      headers: {},
      query: { deviceId: 'spoofed-query-dev' },
      body: { deviceId: 'spoofed-body-dev' },
    };
    assert.throws(
      () => guard.canActivate(createMockContext(req)),
      { name: 'UnauthorizedException' },
    );
  });

  it('rejects requests where query deviceId conflicts with authenticated token deviceId', () => {
    const validToken = tokenService.signDeviceToken('dev-real');
    const req: any = {
      headers: { authorization: `Bearer ${validToken}` },
      query: { deviceId: 'dev-spoofed' },
      body: {},
    };
    assert.throws(
      () => guard.canActivate(createMockContext(req)),
      { name: 'ForbiddenException' },
    );
  });

  it('rejects requests where body deviceId conflicts with authenticated token deviceId', () => {
    const validToken = tokenService.signDeviceToken('dev-real');
    const req: any = {
      headers: { authorization: `Bearer ${validToken}` },
      query: {},
      body: { deviceId: 'dev-spoofed' },
    };
    assert.throws(
      () => guard.canActivate(createMockContext(req)),
      { name: 'ForbiddenException' },
    );
  });

  it('allows unverified x-device-id ONLY when ALLOW_INSECURE_DEV_DEVICE_HEADERS is explicitly enabled in non-production', () => {
    const origFlag = process.env.ALLOW_INSECURE_DEV_DEVICE_HEADERS;
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_INSECURE_DEV_DEVICE_HEADERS = 'true';
    try {
      const req: any = {
        headers: { 'x-device-id': 'dev-legacy-test' },
        query: {},
        body: {},
      };
      const res = guard.canActivate(createMockContext(req));
      assert.equal(res, true);
      assert.equal(req.deviceId, 'dev-legacy-test');
    } finally {
      process.env.ALLOW_INSECURE_DEV_DEVICE_HEADERS = origFlag;
      process.env.NODE_ENV = origEnv;
    }
  });

  it('strictly requires verifiable token in production even if dev headers are sent', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const req: any = {
        headers: { 'x-device-id': 'dev-unverified-in-prod' },
        query: {},
        body: {},
      };
      assert.throws(
        () => guard.canActivate(createMockContext(req)),
        { name: 'UnauthorizedException' },
      );
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('issues verifiable device token via AuthController.issueDeviceToken', () => {
    const authController = new AuthController(tokenService);
    const result = authController.issueDeviceToken({ deviceId: 'firetv-device-test-01' });
    assert.equal(result.deviceId, 'firetv-device-test-01');
    assert.ok(result.token);
    assert.equal(result.token_type, 'Bearer');

    // Token must authenticate with guard
    const req: any = {
      headers: { authorization: `Bearer ${result.token}` },
      query: {},
      body: {},
    };
    const passed = guard.canActivate(createMockContext(req));
    assert.equal(passed, true);
    assert.equal(req.deviceId, 'firetv-device-test-01');
  });

  it('enforces DeviceAuthGuard at class level on ContextController and ProfilesController', () => {
    const contextGuards = Reflect.getMetadata('__guards__', ContextController) || [];
    assert.ok(contextGuards.includes(DeviceAuthGuard), 'ContextController must have DeviceAuthGuard');

    const profileGuards = Reflect.getMetadata('__guards__', ProfilesController) || [];
    assert.ok(profileGuards.includes(DeviceAuthGuard), 'ProfilesController must have DeviceAuthGuard');
  });
});

describe('Phase 1 Basic Backend: Production Credential Enforcement (Item 17)', () => {
  it('marks service unconfigured in production when SUPABASE_SERVICE_ROLE_KEY is missing', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const config = new ConfigService({
        SUPABASE_URL: 'https://xyzcompany.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key-only',
        // SUPABASE_SERVICE_ROLE_KEY omitted
      });
      const supabase = new SupabaseService(config);
      assert.equal(supabase.isConfigured(), false);
      assert.equal(supabase.getClient(), null);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('initializes Supabase client in production when SUPABASE_SERVICE_ROLE_KEY is provided', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const config = new ConfigService({
        SUPABASE_URL: 'https://xyzcompany.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      });
      const supabase = new SupabaseService(config);
      assert.equal(supabase.isConfigured(), true);
      assert.ok(supabase.getClient());
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });
});

describe('Phase 1 Basic Backend: Database Profiles Mutation & Ownership Verification (Item 1)', () => {
  it('updates profile in database when device owns the profile', async () => {
    const mockSupabase = createMockSupabaseService({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { id: 'prof-db-123', device_id: 'authorized-device-1' },
              error: null,
            }),
          }),
        }),
        update: (patch: any) => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({
                  data: {
                    id: 'prof-db-123',
                    device_id: 'authorized-device-1',
                    display_name: patch.display_name || 'Updated Name',
                    mode: patch.mode || 'quick_glance',
                    spoiler_strictness: 'strict',
                    voice_tts_enabled: false,
                    last_active_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    });
    const profiles = new ProfilesService(mockSupabase);

    // Mismatched device is rejected
    await assert.rejects(
      async () =>
        profiles.updateProfile('prof-db-123', { displayName: 'New Name' }, 'unauthorized-device'),
      { name: 'ForbiddenException' },
    );

    // Matching device succeeds
    const updated = await profiles.updateProfile(
      'prof-db-123',
      { displayName: 'New Name' },
      'authorized-device-1',
    );
    assert.equal(updated.display_name, 'New Name');
  });

  it('touches profile in database when device owns the profile', async () => {
    const mockSupabase = createMockSupabaseService({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { id: 'prof-db-touch', device_id: 'dev-touch' },
              error: null,
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                single: async () => ({
                  data: {
                    id: 'prof-db-touch',
                    device_id: 'dev-touch',
                    display_name: 'Touch Profile',
                    mode: 'quick_glance',
                    spoiler_strictness: 'strict',
                    voice_tts_enabled: false,
                    last_active_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    });
    const profiles = new ProfilesService(mockSupabase);

    // Mismatched device is rejected with 403
    await assert.rejects(
      async () => profiles.touchProfile('prof-db-touch', 'rogue-device'),
      { name: 'ForbiddenException' },
    );

    // Matching device succeeds
    const touched = await profiles.touchProfile('prof-db-touch', 'dev-touch');
    assert.ok(touched.last_active_at);
  });
});

describe('Phase 1 Basic Backend: GlobalHttpExceptionFilter Postgres Error Mapping (Item 3 & 14)', () => {
  const filter = new GlobalHttpExceptionFilter();

  function createMockHost(exception: any): { getResponse: () => any; getRequest: () => any; host: any } {
    let statusCode = 200;
    let jsonBody: any = null;
    const headers: Record<string, string> = {};

    const res: any = {
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (body: any) => {
        jsonBody = body;
        return res;
      },
      setHeader: (name: string, val: string) => {
        headers[name] = val;
      },
    };

    const req: any = {
      url: '/test-route',
      headers: { 'x-request-id': 'test-corr-id' },
    };

    const host: any = {
      switchToHttp: () => ({
        getResponse: () => res,
        getRequest: () => req,
      }),
    };

    filter.catch(exception, host);
    return {
      getResponse: () => ({ statusCode, jsonBody, headers }),
      getRequest: () => req,
      host,
    };
  }

  it('maps Postgres 22P02 invalid input syntax to 400 BadRequestException', () => {
    const err: any = new Error('invalid input syntax for type uuid');
    err.code = '22P02';
    const { getResponse } = createMockHost(err);
    const res = getResponse();
    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonBody.error, 'BadRequestException');
  });

  it('maps Postgres 23505 unique violation to 409 ConflictException', () => {
    const err: any = new Error('duplicate key value violates unique constraint');
    err.code = '23505';
    const { getResponse } = createMockHost(err);
    const res = getResponse();
    assert.equal(res.statusCode, 409);
    assert.equal(res.jsonBody.error, 'ConflictException');
  });

  it('maps Postgres 23503 foreign key violation to 400 BadRequestException', () => {
    const err: any = new Error('violates foreign key constraint');
    err.code = '23503';
    const { getResponse } = createMockHost(err);
    const res = getResponse();
    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonBody.error, 'BadRequestException');
  });

  it('maps PostgREST PGRST116 no rows returned to 404 NotFoundException', () => {
    const err: any = new Error('0 rows returned');
    err.code = 'PGRST116';
    const { getResponse } = createMockHost(err);
    const res = getResponse();
    assert.equal(res.statusCode, 404);
    assert.equal(res.jsonBody.error, 'NotFoundException');
  });
});

describe('Phase 1 Basic Backend: Cursor Validation & PostgREST Sanitization (Item 3 & 8)', () => {
  it('rejects invalid cursor payloads with 400 BadRequestException', async () => {
    const config = new ConfigService({});
    const supabase = new SupabaseService(config);
    const catalog = new CatalogService(supabase);

    const makeCursor = (title: string, id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1') =>
      Buffer.from(JSON.stringify({ title, id })).toString('base64url');

    // 1. Malicious cursor token with SQL injection payload in id
    await assert.rejects(
      async () => catalog.listPrograms({ cursor: makeCursor('Tears', "123' OR 1=1--"), limit: 2 }),
      { name: 'BadRequestException' },
    );

    // 2. Non-base64 cursor
    await assert.rejects(
      async () => catalog.listPrograms({ cursor: 'invalid!cursor!', limit: 2 }),
      { name: 'BadRequestException' },
    );

    // 3. Cursor with PostgREST injection / delimiter characters in title
    await assert.rejects(
      async () => catalog.listPrograms({ cursor: makeCursor('Tears",id.gt."bad'), limit: 2 }),
      { name: 'BadRequestException' },
    );

    // 4. Backslashes in title
    await assert.rejects(
      async () => catalog.listPrograms({ cursor: makeCursor('Tears\\Escape'), limit: 2 }),
      { name: 'BadRequestException' },
    );

    // 5. Newlines (\n and \r) in title
    await assert.rejects(
      async () => catalog.listPrograms({ cursor: makeCursor('Tears\nNewline'), limit: 2 }),
      { name: 'BadRequestException' },
    );
    await assert.rejects(
      async () => catalog.listPrograms({ cursor: makeCursor('Tears\rReturn'), limit: 2 }),
      { name: 'BadRequestException' },
    );

    // 6. Tabs in title
    await assert.rejects(
      async () => catalog.listPrograms({ cursor: makeCursor('Tears\tTab'), limit: 2 }),
      { name: 'BadRequestException' },
    );

    // 7. Control characters (\x00, \x1B, \x7F) in title
    await assert.rejects(
      async () => catalog.listPrograms({ cursor: makeCursor('Tears\x00Null'), limit: 2 }),
      { name: 'BadRequestException' },
    );
    await assert.rejects(
      async () => catalog.listPrograms({ cursor: makeCursor('Tears\x1BEscape'), limit: 2 }),
      { name: 'BadRequestException' },
    );

    // 8. Grammar brackets and delimiters (;, {}, [], <>)
    await assert.rejects(
      async () => catalog.listPrograms({ cursor: makeCursor('Tears;drop table'), limit: 2 }),
      { name: 'BadRequestException' },
    );
    await assert.rejects(
      async () => catalog.listPrograms({ cursor: makeCursor('Tears{filter}'), limit: 2 }),
      { name: 'BadRequestException' },
    );
    await assert.rejects(
      async () => catalog.listPrograms({ cursor: makeCursor('Tears[array]'), limit: 2 }),
      { name: 'BadRequestException' },
    );
    await assert.rejects(
      async () => catalog.listPrograms({ cursor: makeCursor('Tears<tag>'), limit: 2 }),
      { name: 'BadRequestException' },
    );
  });

  it('delegates cursor pagination to typed database RPC get_paginated_programs when Supabase is configured', async () => {
    let capturedRpc: { name: string; params: any } | null = null;
    const mockSupabase = createMockSupabaseService({
      rpc: async (name, params) => {
        capturedRpc = { name, params };
        return {
          data: [
            {
              id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
              slug: 'tears-of-steel',
              title: 'Tears of Steel',
              genre: 'Sci-Fi',
              synopsis: 'Test synopsis',
              release_year: 2012,
              rating: 'TV-14',
              poster_url: 'https://img.com/p.jpg',
              backdrop_url: 'https://img.com/b.jpg',
              license_info: 'CC-BY',
              is_active: true,
            },
          ],
          error: null,
        };
      },
    });

    const catalog = new CatalogService(mockSupabase);
    const validCursor = Buffer.from(
      JSON.stringify({ title: 'Cosmic', id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2' }),
    ).toString('base64url');

    const result = await catalog.listPrograms({ cursor: validCursor, limit: 1, genre: 'Sci-Fi' });
    assert.equal(capturedRpc?.name, 'get_paginated_programs');
    assert.equal(capturedRpc?.params.p_cursor_title, 'Cosmic');
    assert.equal(capturedRpc?.params.p_cursor_id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2');
    assert.equal(capturedRpc?.params.p_ascending, true);
    assert.equal(capturedRpc?.params.p_genre, 'Sci-Fi');
    assert.equal(result.items.length, 1);
  });

  it('throws ServiceUnavailableException on database error in getProgramBySlug when fallback is disabled', async () => {
    const origEnv = process.env.ENABLE_DEMO_FALLBACK;
    delete process.env.ENABLE_DEMO_FALLBACK;
    try {
      const mockSupabase = createMockSupabaseService({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: null,
                  error: { code: '500', message: 'connection failure' },
                }),
              }),
            }),
          }),
        }),
      });
      const catalog = new CatalogService(mockSupabase);
      await assert.rejects(
        async () => catalog.getProgramBySlug('tears-of-steel'),
        { name: 'ServiceUnavailableException' },
      );
    } finally {
      if (origEnv !== undefined) process.env.ENABLE_DEMO_FALLBACK = origEnv;
    }
  });

  it('throws ServiceUnavailableException on database error in getEpisodeById when fallback is disabled', async () => {
    const origEnv = process.env.ENABLE_DEMO_FALLBACK;
    delete process.env.ENABLE_DEMO_FALLBACK;
    try {
      const mockSupabase = createMockSupabaseService({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: null,
                  error: { code: '500', message: 'network timeout' },
                }),
              }),
            }),
          }),
        }),
      });
      const catalog = new CatalogService(mockSupabase);
      await assert.rejects(
        async () => catalog.getEpisodeById('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1'),
        { name: 'ServiceUnavailableException' },
      );
    } finally {
      if (origEnv !== undefined) process.env.ENABLE_DEMO_FALLBACK = origEnv;
    }
  });
});

describe('Phase 1 Basic Backend: Profiles Concurrency & Database Outage Safeguards (Item 5 & 11)', () => {
  it('throws ServiceUnavailableException on database error in getProfilesByDeviceId when fallback is disabled', async () => {
    const origEnv = process.env.ENABLE_DEMO_FALLBACK;
    delete process.env.ENABLE_DEMO_FALLBACK;
    try {
      const mockSupabase = createMockSupabaseService({
        from: () => ({
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: null,
                error: { message: 'Database connection failed' },
              }),
            }),
          }),
        }),
      });
      const profiles = new ProfilesService(mockSupabase);
      await assert.rejects(
        async () => profiles.getProfilesByDeviceId('firetv-demo-device-01'),
        { name: 'ServiceUnavailableException' },
      );
    } finally {
      if (origEnv !== undefined) process.env.ENABLE_DEMO_FALLBACK = origEnv;
    }
  });

  it('serializes concurrent profile deletions for the same device to prevent sole-profile race conditions', async () => {
    const config = new ConfigService({});
    const supabase = new SupabaseService(config);
    const profiles = new ProfilesService(supabase);

    // Create 2 profiles on a test device
    const p1 = await profiles.createProfile(
      { deviceId: 'firetv-race-dev', displayName: 'Profile 1' },
      'firetv-race-dev',
    );
    const p2 = await profiles.createProfile(
      { deviceId: 'firetv-race-dev', displayName: 'Profile 2' },
      'firetv-race-dev',
    );

    // Concurrently attempt to delete both profiles
    const results = await Promise.allSettled([
      profiles.deleteProfile(p1.id, 'firetv-race-dev'),
      profiles.deleteProfile(p2.id, 'firetv-race-dev'),
    ]);

    // One must succeed and one must be rejected with BadRequestException
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one concurrent deletion must succeed');
    assert.equal(rejected.length, 1, 'The other concurrent deletion must be rejected');
    assert.equal((rejected[0] as PromiseRejectedResult).reason.name, 'BadRequestException');

    // Confirm that exactly 1 profile remains
    const remaining = await profiles.getProfilesByDeviceId('firetv-race-dev');
    assert.equal(remaining.length, 1);
  });

  it('delegates to atomic delete_viewing_profile RPC with row-locking and maps Postgres error codes', async () => {
    let capturedRpc: { name: string; params: any } | null = null;
    const mockSupabase = createMockSupabaseService({
      rpc: async (name, params) => {
        capturedRpc = { name, params };
        if (params.p_profile_id === 'sole-profile') {
          return { data: null, error: { code: '23514', message: 'CANNOT_DELETE_SOLE_PROFILE' } };
        }
        if (params.p_profile_id === 'missing-profile') {
          return { data: null, error: { code: 'P0002', message: 'PROFILE_NOT_FOUND' } };
        }
        if (params.p_profile_id === 'alien-device-profile') {
          return { data: null, error: { code: '42501', message: 'FORBIDDEN_DEVICE_MISMATCH' } };
        }
        return { data: { success: true, message: 'Deleted' }, error: null };
      },
    });

    const profiles = new ProfilesService(mockSupabase);

    // Sole profile deletion rejected atomically with BadRequestException
    await assert.rejects(
      async () => profiles.deleteProfile('sole-profile', 'dev-1'),
      { name: 'BadRequestException' },
    );
    assert.equal(capturedRpc?.name, 'delete_viewing_profile');

    // Missing profile rejected with NotFoundException
    await assert.rejects(
      async () => profiles.deleteProfile('missing-profile', 'dev-1'),
      { name: 'NotFoundException' },
    );

    // Mismatched device rejected with ForbiddenException
    await assert.rejects(
      async () => profiles.deleteProfile('alien-device-profile', 'dev-1'),
      { name: 'ForbiddenException' },
    );

    // Valid deletion succeeds
    const res = await profiles.deleteProfile('valid-profile', 'dev-1');
    assert.equal(res.success, true);
  });

  it('preserves strict DB boundary: does NOT fall back to in-memory fixtures on misses or empty results', async () => {
    const origEnv = process.env.ENABLE_DEMO_FALLBACK;
    delete process.env.ENABLE_DEMO_FALLBACK;
    try {
      const mockSupabase = createMockSupabaseService({
        from: (table: string) => ({
          select: () => ({
            eq: () => ({
              order: async () => ({ data: [], error: null }),
              single: async () => ({ data: null, error: { code: 'PGRST116', message: '0 rows' } }),
            }),
          }),
        }),
        rpc: async () => ({ data: null, error: null }),
      });

      const profiles = new ProfilesService(mockSupabase);
      const catalog = new CatalogService(mockSupabase);
      const context = new ContextService(mockSupabase, catalog, profiles);

      // 1. getProfilesByDeviceId returns [] on empty DB result without falling back to demo profiles
      const devProfiles = await profiles.getProfilesByDeviceId('firetv-demo-device-01');
      assert.deepEqual(devProfiles, []);

      // 2. getProfileById returns null on PGRST116 without falling back to demo profiles
      const singleProfile = await profiles.getProfileById('11111111-1111-1111-1111-111111111111');
      assert.equal(singleProfile, null);

      // 3. getSpoilerSafeContext throws NotFoundException when DB returns null
      await assert.rejects(
        async () => context.getSpoilerSafeContext('non-existent-ep', 10000),
        { name: 'NotFoundException' },
      );
    } finally {
      if (origEnv !== undefined) process.env.ENABLE_DEMO_FALLBACK = origEnv;
    }
  });
});

describe('Phase 1 Basic Backend: Production Readiness Probe Strict Failure (Item 17)', () => {
  it('returns HTTP 503 and status unhealthy in production when Supabase is unconfigured', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const config = new ConfigService({});
      const supabase = new SupabaseService(config);
      const health = new HealthController(supabase);

      let statusCode = 200;
      const res: any = {
        status: (code: number) => {
          statusCode = code;
          return res;
        },
      };

      const readiness = await health.getReadiness(res);
      assert.equal(statusCode, 503);
      assert.equal(readiness.status, 'unhealthy');
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });
});

describe('Phase 1 Basic Backend: Production Demo Fallback Quarantine & Startup Gate', () => {
  it('validateEnvironment throws fatal error on startup when ENABLE_DEMO_FALLBACK is enabled under NODE_ENV=production', () => {
    const origEnv = process.env.NODE_ENV;
    const origFallback = process.env.ENABLE_DEMO_FALLBACK;
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_DEMO_FALLBACK = 'true';
    try {
      assert.throws(
        () => validateEnvironment(),
        /Fatal configuration error: ENABLE_DEMO_FALLBACK cannot be enabled in a production environment/,
      );
    } finally {
      process.env.NODE_ENV = origEnv;
      process.env.ENABLE_DEMO_FALLBACK = origFallback;
    }
  });

  it('guarantees that under NODE_ENV=production, services reject demo fallback even if ENABLE_DEMO_FALLBACK=true', async () => {
    const origEnv = process.env.NODE_ENV;
    const origFallback = process.env.ENABLE_DEMO_FALLBACK;
    process.env.NODE_ENV = 'production';
    process.env.ENABLE_DEMO_FALLBACK = 'true';
    try {
      const mockSupabase = createMockSupabaseService({
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: async () => ({
                  data: null,
                  error: { code: '500', message: 'connection failed' },
                }),
              }),
            }),
          }),
        }),
      });

      const catalog = new CatalogService(mockSupabase);
      await assert.rejects(
        async () => catalog.getProgramBySlug('tears-of-steel'),
        { name: 'ServiceUnavailableException' },
      );
    } finally {
      process.env.NODE_ENV = origEnv;
      process.env.ENABLE_DEMO_FALLBACK = origFallback;
    }
  });
});

describe('Phase 1 Basic Backend: PostgreSQL Migration Invariants & RPC Security', () => {
  it('0006_atomic_profile_deletion.sql enforces advisory locking, row-level locks, and service-role execution', () => {
    const sql = fs.readFileSync(
      path.resolve('supabase/migrations/0006_atomic_profile_deletion.sql'),
      'utf8',
    );

    // Advisory transaction lock
    assert.ok(
      sql.includes('pg_advisory_xact_lock(hashtext(v_clean_device_id))'),
      '0006 must acquire transaction advisory lock on device ID',
    );

    // Row-level lock on all device profiles
    assert.ok(
      sql.includes('for update'),
      '0006 must acquire row locks on device profiles before counting',
    );

    // Service role caller gate
    assert.ok(
      sql.includes('public.is_service_role_caller()'),
      '0006 must verify caller is service_role inside the function',
    );

    // Revocation from anon/authenticated
    assert.ok(
      sql.includes('revoke all on function public.delete_viewing_profile(uuid, text) from anon, authenticated;'),
      '0006 must revoke execute from anon and authenticated',
    );

    // Grant execute strictly to service_role
    assert.ok(
      sql.includes('grant execute on function public.delete_viewing_profile(uuid, text) to service_role;'),
      '0006 must grant execute strictly to service_role',
    );
  });

  it('0007_typed_catalog_pagination.sql provides parameterized cursor RPC without raw string filter interpolation', () => {
    const sql = fs.readFileSync(
      path.resolve('supabase/migrations/0007_typed_catalog_pagination.sql'),
      'utf8',
    );

    assert.ok(
      sql.includes('create or replace function public.get_paginated_programs'),
      '0007 must define get_paginated_programs RPC',
    );
    assert.ok(
      sql.includes('p_cursor_title text'),
      '0007 must accept typed p_cursor_title',
    );
    assert.ok(
      sql.includes('p_cursor_id uuid'),
      '0007 must accept typed p_cursor_id',
    );
    assert.ok(
      sql.includes('grant execute on function public.get_paginated_programs'),
      '0007 must grant execution to anon, authenticated, and service_role',
    );
  });
});



