import 'reflect-metadata';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ConfigService } from '@nestjs/config';

import { CatalogService } from '../dist/modules/catalog/catalog.service.js';
import { ProfilesService } from '../dist/modules/profiles/profiles.service.js';
import { ContextService } from '../dist/modules/context/context.service.js';
import { SupabaseService } from '../dist/modules/supabase/supabase.service.js';
import { HealthController } from '../dist/modules/health/health.controller.js';
import { ParseSlugPipe } from '../dist/common/pipes/parse-slug.pipe.js';
import { DeviceAuthGuard } from '../dist/common/guards/device-auth.guard.js';

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
          eq: () => ({
            single: async () => ({
              data: { id: 'prof-db-1', device_id: 'authorized-device-abc' },
              error: null,
            }),
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

  it('returns diagnostic readiness with database metrics', async () => {
    const readiness = await health.getReadiness();
    assert.ok(readiness.status === 'ok' || readiness.status === 'degraded');
    assert.ok(readiness.database);
    assert.equal(readiness.database.configured, false);
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
  const guard = new DeviceAuthGuard();

  function createMockContext(req: any) {
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as any;
  }

  it('authenticates via X-Device-Id header and attaches deviceId to request', () => {
    const req: any = {
      headers: { 'x-device-id': 'firetv-4k-living-room' },
      query: {},
      body: {},
    };
    const res = guard.canActivate(createMockContext(req));
    assert.equal(res, true);
    assert.equal(req.deviceId, 'firetv-4k-living-room');
  });

  it('authenticates via Authorization: Device header scheme', () => {
    const req: any = {
      headers: { authorization: 'Device firetv-bedroom' },
      query: {},
      body: {},
    };
    const res = guard.canActivate(createMockContext(req));
    assert.equal(res, true);
    assert.equal(req.deviceId, 'firetv-bedroom');
  });

  it('rejects requests with no device identification in header or parameters', () => {
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

  it('rejects requests where query deviceId conflicts with authenticated header deviceId', () => {
    const req: any = {
      headers: { 'x-device-id': 'dev-real' },
      query: { deviceId: 'dev-spoofed' },
      body: {},
    };
    assert.throws(
      () => guard.canActivate(createMockContext(req)),
      { name: 'ForbiddenException' },
    );
  });

  it('rejects requests where body deviceId conflicts with authenticated header deviceId', () => {
    const req: any = {
      headers: { 'x-device-id': 'dev-real' },
      query: {},
      body: { deviceId: 'dev-spoofed' },
    };
    assert.throws(
      () => guard.canActivate(createMockContext(req)),
      { name: 'ForbiddenException' },
    );
  });

  it('strictly requires X-Device-Id header in production mode', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const req: any = {
        headers: {},
        query: { deviceId: 'dev-param-only' },
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

