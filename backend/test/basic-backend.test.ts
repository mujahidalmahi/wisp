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

  it('lists active programs with pagination and sorting', async () => {
    const programs = await catalog.listPrograms({ limit: 2, offset: 0, order: 'asc' });
    assert.ok(Array.isArray(programs));
    assert.equal(programs.length, 2);
    assert.ok(programs[0].title.localeCompare(programs[1].title) <= 0);
  });

  it('filters programs by genre with case insensitivity', async () => {
    const sciFi = await catalog.listPrograms({ genre: 'sci-fi' });
    assert.ok(sciFi.some((p: any) => p.slug === 'tears-of-steel'));
    assert.ok(!sciFi.some((p: any) => p.slug === 'cosmic-origins'));
  });

  it('searches programs by title or synopsis query', async () => {
    const searched = await catalog.listPrograms({ q: 'Amsterdam' });
    assert.equal(searched.length, 1);
    assert.equal(searched[0].slug, 'tears-of-steel');
    assert.equal(searched[0].episode_count, 2);
  });

  it('fetches program by slug with published episodes', async () => {
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

  it('fetches playable episode with sibling binge-watching pointers', async () => {
    const ep = await catalog.getEpisodeById('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1');
    assert.equal(ep.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1');
    assert.equal(ep.title, 'The Amsterdam Calibration');
    assert.equal(ep.duration_ms, 734000);
    assert.equal(ep.program_title, 'Tears of Steel');
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
    const created = await profiles.createProfile({
      deviceId: 'firetv-test-device-99',
      displayName: 'Guest Room TV',
      mode: HouseholdProfileMode.DEEP_LORE,
      spoilerStrictness: 'strict',
      voiceTtsEnabled: true,
    });
    assert.ok(created.id);
    assert.equal(created.device_id, 'firetv-test-device-99');
    assert.equal(created.display_name, 'Guest Room TV');
    assert.equal(created.mode, HouseholdProfileMode.DEEP_LORE);
    assert.equal(created.voice_tts_enabled, true);

    const retrieved = await profiles.getProfilesByDeviceId('firetv-test-device-99');
    assert.equal(retrieved.length, 1);
    assert.equal(retrieved[0].display_name, 'Guest Room TV');
  });

  it('updates an existing profile preference', async () => {
    const updated = await profiles.updateProfile('11111111-1111-1111-1111-111111111111', {
      mode: HouseholdProfileMode.FAMILY_FRIENDLY,
      voiceTtsEnabled: true,
    });
    assert.equal(updated.mode, HouseholdProfileMode.FAMILY_FRIENDLY);
    assert.equal(updated.voice_tts_enabled, true);
  });

  it('touches an existing profile updating last_active_at', async () => {
    const touched = await profiles.touchProfile('11111111-1111-1111-1111-111111111111');
    assert.ok(touched.last_active_at);
  });

  it('throws 404 when updating non-existent profile', async () => {
    await assert.rejects(
      async () => profiles.updateProfile('99999999-9999-9999-9999-999999999999', { displayName: 'Ghost' }),
      { name: 'NotFoundException' },
    );
  });

  it('prevents deleting the sole viewing profile on a device', async () => {
    await assert.rejects(
      async () => {
        // device-99 has only 1 profile created above
        const profilesOn99 = await profiles.getProfilesByDeviceId('firetv-test-device-99');
        assert.equal(profilesOn99.length, 1);
        await profiles.deleteProfile(profilesOn99[0].id);
      },
      { name: 'BadRequestException' },
    );
  });
});

describe('Phase 1 Basic Backend: Temporal Context & Stage-1 Bootstrap', () => {
  const config = new ConfigService({});
  const supabase = new SupabaseService(config);
  const context = new ContextService(supabase);

  it('returns spoiler-safe context bounded by playbackPositionMs', async () => {
    const res = await context.getSpoilerSafeContext('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 45000);
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

  it('returns sub-50ms Stage-1 Fire TV Bootstrap bundle with zero-typing chips guarantee', async () => {
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
    assert.ok(boot.prewarmed_cards.length >= 1);
    assert.equal(boot.safe_playback_ms, 45000);
  });
});

describe('Phase 1 Basic Backend: DTO Validation Guards', () => {
  it('rejects CreateProfileDto with missing required fields', async () => {
    const dto = plainToInstance(CreateProfileDto, { displayName: '' });
    const errors = await validate(dto);
    assert.ok(errors.length > 0);
    const properties = errors.map((e) => e.property);
    assert.ok(properties.includes('deviceId'));
    assert.ok(properties.includes('displayName'));
  });

  it('rejects CreateProfileDto with invalid profile mode', async () => {
    const dto = plainToInstance(CreateProfileDto, {
      deviceId: 'dev-01',
      displayName: 'Main',
      mode: 'invalid_mode_xyz',
    });
    const errors = await validate(dto);
    assert.ok(errors.some((e) => e.property === 'mode'));
  });

  it('validates correct CreateProfileDto', async () => {
    const dto = plainToInstance(CreateProfileDto, {
      deviceId: 'dev-01',
      displayName: 'Main Profile',
      mode: HouseholdProfileMode.QUICK_GLANCE,
      spoilerStrictness: 'strict',
    });
    const errors = await validate(dto);
    assert.equal(errors.length, 0);
  });

  it('rejects GetContextQueryDto with negative playbackMs', async () => {
    const dto = plainToInstance(GetContextQueryDto, { playbackMs: -100 });
    const errors = await validate(dto);
    assert.ok(errors.some((e) => e.property === 'playbackMs'));
  });

  it('rejects GetBootstrapQueryDto with missing deviceId', async () => {
    const dto = plainToInstance(GetBootstrapQueryDto, { playbackMs: 1000 });
    const errors = await validate(dto);
    assert.ok(errors.some((e) => e.property === 'deviceId'));
  });

  it('rejects GetBootstrapQueryDto with invalid UUID for profileId', async () => {
    const dto = plainToInstance(GetBootstrapQueryDto, {
      deviceId: 'dev-01',
      profileId: 'not-a-uuid',
    });
    const errors = await validate(dto);
    assert.ok(errors.some((e) => e.property === 'profileId'));
  });

  it('validates clean GetBootstrapQueryDto with valid UUID', async () => {
    const dto = plainToInstance(GetBootstrapQueryDto, {
      deviceId: 'dev-01',
      playbackMs: 5000,
      profileId: '11111111-1111-4111-a111-111111111111',
    });
    const errors = await validate(dto);
    assert.equal(errors.length, 0);
  });

  it('rejects GetProgramsQueryDto with invalid limit or negative offset', async () => {
    const dto = plainToInstance(GetProgramsQueryDto, { limit: 500, offset: -5 });
    const errors = await validate(dto);
    assert.ok(errors.some((e) => e.property === 'limit'));
    assert.ok(errors.some((e) => e.property === 'offset'));
  });
});
