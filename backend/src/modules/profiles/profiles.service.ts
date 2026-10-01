import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { HouseholdProfileMode } from '../../common/dto/wisp-query.dto';
import { randomUUID } from 'crypto';

export interface ViewingProfile {
  id: string;
  device_id: string;
  display_name: string;
  mode: HouseholdProfileMode;
  spoiler_strictness: string;
  voice_tts_enabled: boolean;
  avatar_color?: string;
  last_active_at: string;
  created_at?: string;
  updated_at?: string;
}

const IN_MEMORY_PROFILES: Map<string, ViewingProfile> = new Map([
  [
    '11111111-1111-1111-1111-111111111111',
    {
      id: '11111111-1111-1111-1111-111111111111',
      device_id: 'firetv-demo-device-01',
      display_name: 'Living Room TV',
      mode: HouseholdProfileMode.QUICK_GLANCE,
      spoiler_strictness: 'strict',
      voice_tts_enabled: false,
      avatar_color: '#4f46e5',
      last_active_at: new Date().toISOString(),
    },
  ],
  [
    '22222222-2222-2222-2222-222222222222',
    {
      id: '22222222-2222-2222-2222-222222222222',
      device_id: 'firetv-demo-device-01',
      display_name: 'Kids Profile',
      mode: HouseholdProfileMode.FAMILY_FRIENDLY,
      spoiler_strictness: 'strict',
      voice_tts_enabled: true,
      avatar_color: '#10b981',
      last_active_at: new Date().toISOString(),
    },
  ],
]);

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async getProfilesByDeviceId(deviceId: string): Promise<ViewingProfile[]> {
    const cleanDeviceId = deviceId.trim();
    const client = this.supabaseService.getClient();

    if (client) {
      try {
        const { data, error } = await this.supabaseService.executeWithRetry(async () =>
          client
            .from('profiles')
            .select('id, device_id, display_name, mode, spoiler_strictness, voice_tts_enabled, avatar_color, last_active_at, created_at, updated_at')
            .eq('device_id', cleanDeviceId)
            .order('last_active_at', { ascending: false }),
        );

        if (!error && data) {
          return data as ViewingProfile[];
        }
        if (error) {
          this.logger.warn(`Failed to fetch profiles from database: ${error.message}. Using in-memory fallback.`);
        }
      } catch (err: any) {
        this.logger.warn(`Database profiles query error: ${err?.message}. Using in-memory fallback.`);
      }
    }

    const matches: ViewingProfile[] = [];
    for (const profile of IN_MEMORY_PROFILES.values()) {
      if (profile.device_id === cleanDeviceId) {
        matches.push(profile);
      }
    }
    return matches.sort(
      (a, b) => new Date(b.last_active_at).getTime() - new Date(a.last_active_at).getTime(),
    );
  }

  async createProfile(dto: CreateProfileDto): Promise<ViewingProfile> {
    const cleanDeviceId = dto.deviceId.trim();
    const cleanDisplayName = dto.displayName.trim();
    const mode = dto.mode || HouseholdProfileMode.QUICK_GLANCE;
    const spoilerStrictness = dto.spoilerStrictness || 'strict';
    const voiceTtsEnabled = dto.voiceTtsEnabled ?? false;
    const avatarColor = dto.avatarColor || '#6366f1';
    const client = this.supabaseService.getClient();

    if (client) {
      try {
        const { data, error } = await this.supabaseService.executeWithRetry(async () =>
          client
            .from('profiles')
            .upsert(
              {
                device_id: cleanDeviceId,
                display_name: cleanDisplayName,
                mode,
                spoiler_strictness: spoilerStrictness,
                voice_tts_enabled: voiceTtsEnabled,
                avatar_color: avatarColor,
                last_active_at: new Date().toISOString(),
              },
              { onConflict: 'device_id,display_name' },
            )
            .select()
            .single(),
        );

        if (!error && data) {
          return data as ViewingProfile;
        }
        if (error) {
          this.logger.warn(`Failed to upsert profile in database: ${error.message}. Using in-memory fallback.`);
        }
      } catch (err: any) {
        this.logger.warn(`Database profile upsert error: ${err?.message}. Using in-memory fallback.`);
      }
    }

    // In-memory fallback
    let existingId: string | null = null;
    for (const [id, profile] of IN_MEMORY_PROFILES.entries()) {
      if (profile.device_id === cleanDeviceId && profile.display_name === cleanDisplayName) {
        existingId = id;
        break;
      }
    }

    const profileId = existingId || randomUUID();
    const profileRecord: ViewingProfile = {
      id: profileId,
      device_id: cleanDeviceId,
      display_name: cleanDisplayName,
      mode,
      spoiler_strictness: spoilerStrictness,
      voice_tts_enabled: voiceTtsEnabled,
      avatar_color: avatarColor,
      last_active_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    IN_MEMORY_PROFILES.set(profileId, profileRecord);
    return profileRecord;
  }

  async updateProfile(profileId: string, dto: UpdateProfileDto): Promise<ViewingProfile> {
    const client = this.supabaseService.getClient();

    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (dto.displayName !== undefined) updates.display_name = dto.displayName.trim();
    if (dto.mode !== undefined) updates.mode = dto.mode;
    if (dto.spoilerStrictness !== undefined) updates.spoiler_strictness = dto.spoilerStrictness;
    if (dto.voiceTtsEnabled !== undefined) updates.voice_tts_enabled = dto.voiceTtsEnabled;
    if (dto.avatarColor !== undefined) updates.avatar_color = dto.avatarColor;

    if (client) {
      try {
        const { data, error } = await this.supabaseService.executeWithRetry(async () =>
          client
            .from('profiles')
            .update(updates)
            .eq('id', profileId)
            .select()
            .single(),
        );

        if (!error && data) {
          return data as ViewingProfile;
        }
        if (error && error.code === 'PGRST116') {
          throw new NotFoundException(`Profile with ID '${profileId}' not found`);
        }
        if (error) {
          this.logger.warn(`Database profile update failed: ${error.message}. Using in-memory fallback.`);
        }
      } catch (err: any) {
        if (err instanceof NotFoundException) throw err;
        this.logger.warn(`Database profile update error: ${err?.message}. Using in-memory fallback.`);
      }
    }

    const existing = IN_MEMORY_PROFILES.get(profileId);
    if (!existing) {
      throw new NotFoundException(`Profile with ID '${profileId}' not found`);
    }

    const updated: ViewingProfile = {
      ...existing,
      ...updates,
      last_active_at: new Date().toISOString(),
    };
    IN_MEMORY_PROFILES.set(profileId, updated);
    return updated;
  }

  async touchProfile(profileId: string): Promise<ViewingProfile> {
    const client = this.supabaseService.getClient();
    const nowIso = new Date().toISOString();

    if (client) {
      try {
        const { data, error } = await this.supabaseService.executeWithRetry(async () =>
          client
            .from('profiles')
            .update({ last_active_at: nowIso, updated_at: nowIso })
            .eq('id', profileId)
            .select()
            .single(),
        );

        if (!error && data) {
          return data as ViewingProfile;
        }
        if (error && error.code === 'PGRST116') {
          throw new NotFoundException(`Profile with ID '${profileId}' not found`);
        }
      } catch (err: any) {
        if (err instanceof NotFoundException) throw err;
        this.logger.warn(`Database touchProfile error: ${err?.message}. Using in-memory fallback.`);
      }
    }

    const existing = IN_MEMORY_PROFILES.get(profileId);
    if (!existing) {
      throw new NotFoundException(`Profile with ID '${profileId}' not found`);
    }

    const touched: ViewingProfile = {
      ...existing,
      last_active_at: nowIso,
      updated_at: nowIso,
    };
    IN_MEMORY_PROFILES.set(profileId, touched);
    return touched;
  }

  async deleteProfile(profileId: string): Promise<{ success: boolean; message: string }> {
    const client = this.supabaseService.getClient();

    if (client) {
      try {
        // Check profile exists and device has at least one other profile
        const { data: target } = await client
          .from('profiles')
          .select('id, device_id')
          .eq('id', profileId)
          .single();

        if (!target) {
          throw new NotFoundException(`Profile with ID '${profileId}' not found`);
        }

        const { count } = await client
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('device_id', target.device_id);

        if (count && count <= 1) {
          throw new BadRequestException('Cannot delete the sole viewing profile on this device');
        }

        const { error } = await client.from('profiles').delete().eq('id', profileId);
        if (!error) {
          return { success: true, message: `Profile '${profileId}' deleted successfully` };
        }
      } catch (err: any) {
        if (err instanceof NotFoundException || err instanceof BadRequestException) throw err;
        this.logger.warn(`Database profile delete error: ${err?.message}. Using in-memory fallback.`);
      }
    }

    const existing = IN_MEMORY_PROFILES.get(profileId);
    if (!existing) {
      throw new NotFoundException(`Profile with ID '${profileId}' not found`);
    }

    let deviceProfileCount = 0;
    for (const p of IN_MEMORY_PROFILES.values()) {
      if (p.device_id === existing.device_id) deviceProfileCount++;
    }

    if (deviceProfileCount <= 1) {
      throw new BadRequestException('Cannot delete the sole viewing profile on this device');
    }

    IN_MEMORY_PROFILES.delete(profileId);
    return { success: true, message: `Profile '${profileId}' deleted successfully` };
  }
}
