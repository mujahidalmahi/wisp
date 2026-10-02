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

describe('Phase 1 Basic Backend: Catalog Module', () => {
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

  it('rejects bootstrap when requested profileId does not belong to deviceId (Item 2)', async () => {
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
});

describe('Phase 1 Basic Backend: SupabaseService Transient Error Classification (Item 12)', () => {
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
