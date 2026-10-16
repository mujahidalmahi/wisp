import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
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

  private readonly deletionLocks = new Map<string, Promise<any>>();

  private allowDemoFallback(isConfigured: boolean): boolean {
    const isProduction = process.env.NODE_ENV === 'production';
    return !isConfigured || (!isProduction && process.env.ENABLE_DEMO_FALLBACK === 'true');
  }

  async getProfilesByDeviceId(deviceId: string): Promise<ViewingProfile[]> {
    const cleanDeviceId = deviceId.trim();
    const isConfigured = this.supabaseService.isConfigured();
    const allowDemoFallback = this.allowDemoFallback(isConfigured);

    if (isConfigured) {
      const client = this.supabaseService.getClient()!;
      try {
        const { data, error } = await this.supabaseService.executeWithRetry(async () =>
          client
            .from('profiles')
            .select('id, device_id, display_name, mode, spoiler_strictness, voice_tts_enabled, avatar_color, last_active_at, created_at, updated_at')
            .eq('device_id', cleanDeviceId)
            .order('last_active_at', { ascending: false }),
        );

        if (error) {
          this.logger.error(`Database profiles query error: ${error.message}`);
          if (!allowDemoFallback) {
            throw new ServiceUnavailableException(`Database profiles query failed: ${error.message}`);
          }
        } else if (data) {
          return data as ViewingProfile[];
        }
      } catch (err: any) {
        if (err instanceof ServiceUnavailableException) throw err;
        this.logger.error(`Database profiles query error: ${err?.message}`);
        if (!allowDemoFallback) {
          throw new ServiceUnavailableException('Database profiles query failed');
        }
      }
      if (!allowDemoFallback) {
        return [];
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

  async getProfileById(profileId: string): Promise<ViewingProfile | null> {
    const isConfigured = this.supabaseService.isConfigured();
    const allowDemoFallback = this.allowDemoFallback(isConfigured);

    if (isConfigured) {
      const client = this.supabaseService.getClient()!;
      try {
        const { data, error } = await this.supabaseService.executeWithRetry(async () =>
          client
            .from('profiles')
            .select('id, device_id, display_name, mode, spoiler_strictness, voice_tts_enabled, avatar_color, last_active_at, created_at, updated_at')
            .eq('id', profileId)
            .single(),
        );

        if (error) {
          if (error.code === 'PGRST116') {
            return null;
          }
          this.logger.error(`Database getProfileById error: ${error.message}`);
          if (!allowDemoFallback) {
            throw new ServiceUnavailableException(`Database error: ${error.message}`);
          }
        } else if (data) {
          return data as ViewingProfile;
        }
      } catch (err: any) {
        if (err instanceof ServiceUnavailableException) throw err;
        this.logger.error(`Database getProfileById error: ${err?.message}`);
        if (!allowDemoFallback) {
          throw new ServiceUnavailableException('Database error fetching profile');
        }
      }
      if (!allowDemoFallback) {
        return null;
      }
    }

    return IN_MEMORY_PROFILES.get(profileId) || null;
  }

  async createProfile(dto: CreateProfileDto, authenticatedDeviceId?: string): Promise<ViewingProfile> {
    const cleanDeviceId = (authenticatedDeviceId || dto.deviceId).trim();
    if (authenticatedDeviceId && dto.deviceId && dto.deviceId.trim() !== authenticatedDeviceId) {
      throw new ForbiddenException(
        `Device mismatch: cannot create profile for '${dto.deviceId}' on behalf of '${authenticatedDeviceId}'`,
      );
    }

    const cleanDisplayName = dto.displayName.trim();
    const mode = dto.mode || HouseholdProfileMode.QUICK_GLANCE;
    const spoilerStrictness = dto.spoilerStrictness || 'strict';
    const voiceTtsEnabled = dto.voiceTtsEnabled ?? false;
    const avatarColor = dto.avatarColor || '#6366f1';

    // Enforce 10-profile maximum per device to prevent storage exhaustion attacks
    const existingProfiles = await this.getProfilesByDeviceId(cleanDeviceId);
    const isExistingName = existingProfiles.some(
      (p) => p.display_name.toLowerCase() === cleanDisplayName.toLowerCase(),
    );
    if (!isExistingName && existingProfiles.length >= 10) {
      throw new BadRequestException('Maximum limit of 10 profiles reached for this device.');
    }

    const isConfigured = this.supabaseService.isConfigured();
    const allowDemoFallback = this.allowDemoFallback(isConfigured);

    if (isConfigured) {

      const client = this.supabaseService.getClient()!;
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

        if (error) {
          this.logger.error(`Database profile upsert failed: ${error.message}`);
          if (!allowDemoFallback) {
            throw new ServiceUnavailableException(`Database profile creation failed: ${error.message}`);
          }
        } else if (data) {
          return data as ViewingProfile;
        }
      } catch (err: any) {
        if (err instanceof ServiceUnavailableException) throw err;
        this.logger.error(`Database profile upsert error: ${err?.message}`);
        if (!allowDemoFallback) {
          throw new ServiceUnavailableException('Database profile upsert failed');
        }
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    IN_MEMORY_PROFILES.set(profileId, profileRecord);
    return profileRecord;
  }

  async updateProfile(
    profileId: string,
    updates: UpdateProfileDto,
    authenticatedDeviceId?: string,
  ): Promise<ViewingProfile> {
    const isConfigured = this.supabaseService.isConfigured();
    const allowDemoFallback = this.allowDemoFallback(isConfigured);

    if (isConfigured) {
      const client = this.supabaseService.getClient()!;
      // 1. Verify existence and device ownership
      const { data: existing, error: findError } = await this.supabaseService.executeWithRetry(async () =>
        client
          .from('profiles')
          .select('id, device_id')
          .eq('id', profileId)
          .single(),
      );

      if (findError) {
        if (findError.code === 'PGRST116') {
          throw new NotFoundException(`Profile with ID '${profileId}' not found`);
        }
        this.logger.error(`Database find profile error: ${findError.message}`);
        if (!allowDemoFallback) {
          throw new ServiceUnavailableException(`Database error: ${findError.message}`);
        }
      } else if (!existing) {
        throw new NotFoundException(`Profile with ID '${profileId}' not found`);
      }

      if (existing) {
        if (authenticatedDeviceId && existing.device_id !== authenticatedDeviceId) {
          throw new ForbiddenException('Profile does not belong to the authenticated device');
        }

        const patchData: Record<string, any> = {
          updated_at: new Date().toISOString(),
        };
        if (updates.displayName !== undefined) patchData.display_name = updates.displayName.trim();
        if (updates.mode !== undefined) patchData.mode = updates.mode;
        if (updates.spoilerStrictness !== undefined) patchData.spoiler_strictness = updates.spoilerStrictness;
        if (updates.voiceTtsEnabled !== undefined) patchData.voice_tts_enabled = updates.voiceTtsEnabled;
        if (updates.avatarColor !== undefined) patchData.avatar_color = updates.avatarColor;

        const { data, error } = await this.supabaseService.executeWithRetry(async () =>
          client
            .from('profiles')
            .update(patchData)
            .eq('id', profileId)
            .eq('device_id', existing.device_id)
            .select()
            .single(),
        );

        if (error) {
          this.logger.error(`Database updateProfile error: ${error.message}`);
          if (!allowDemoFallback) {
            throw new ServiceUnavailableException(`Database update failed: ${error.message}`);
          }
        } else if (data) {
          return data as ViewingProfile;
        }
      }
    }

    const existing = IN_MEMORY_PROFILES.get(profileId);
    if (!existing) {
      throw new NotFoundException(`Profile with ID '${profileId}' not found`);
    }

    if (authenticatedDeviceId && existing.device_id !== authenticatedDeviceId) {
      throw new ForbiddenException('Profile does not belong to the authenticated device');
    }

    const updated: ViewingProfile = {
      ...existing,
      ...(updates.displayName !== undefined ? { display_name: updates.displayName.trim() } : {}),
      ...(updates.mode !== undefined ? { mode: updates.mode } : {}),
      ...(updates.spoilerStrictness !== undefined ? { spoiler_strictness: updates.spoilerStrictness } : {}),
      ...(updates.voiceTtsEnabled !== undefined ? { voice_tts_enabled: updates.voiceTtsEnabled } : {}),
      ...(updates.avatarColor !== undefined ? { avatar_color: updates.avatarColor } : {}),
      last_active_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    IN_MEMORY_PROFILES.set(profileId, updated);
    return updated;
  }

  async touchProfile(profileId: string, authenticatedDeviceId?: string): Promise<ViewingProfile> {
    const isConfigured = this.supabaseService.isConfigured();
    const allowDemoFallback = this.allowDemoFallback(isConfigured);
    const nowIso = new Date().toISOString();

    if (isConfigured) {
      const client = this.supabaseService.getClient()!;
      // 1. Verify existence and device ownership
      const { data: existing, error: findError } = await this.supabaseService.executeWithRetry(async () =>
        client
          .from('profiles')
          .select('id, device_id')
          .eq('id', profileId)
          .single(),
      );

      if (findError) {
        if (findError.code === 'PGRST116') {
          throw new NotFoundException(`Profile with ID '${profileId}' not found`);
        }
        this.logger.error(`Database find profile error: ${findError.message}`);
        if (!allowDemoFallback) {
          throw new ServiceUnavailableException(`Database error: ${findError.message}`);
        }
      } else if (!existing) {
        throw new NotFoundException(`Profile with ID '${profileId}' not found`);
      }

      if (existing) {
        if (authenticatedDeviceId && existing.device_id !== authenticatedDeviceId) {
          throw new ForbiddenException('Profile does not belong to the authenticated device');
        }

        const { data, error } = await this.supabaseService.executeWithRetry(async () =>
          client
            .from('profiles')
            .update({ last_active_at: nowIso, updated_at: nowIso })
            .eq('id', profileId)
            .eq('device_id', existing.device_id)
            .select()
            .single(),
        );

        if (error) {
          this.logger.error(`Database touchProfile error: ${error.message}`);
          if (!allowDemoFallback) {
            throw new ServiceUnavailableException(`Database touch failed: ${error.message}`);
          }
        } else if (data) {
          return data as ViewingProfile;
        }
      }
    }

    const existing = IN_MEMORY_PROFILES.get(profileId);
    if (!existing) {
      throw new NotFoundException(`Profile with ID '${profileId}' not found`);
    }

    if (authenticatedDeviceId && existing.device_id !== authenticatedDeviceId) {
      throw new ForbiddenException('Profile does not belong to the authenticated device');
    }

    const touched: ViewingProfile = {
      ...existing,
      last_active_at: nowIso,
      updated_at: nowIso,
    };
    IN_MEMORY_PROFILES.set(profileId, touched);
    return touched;
  }

  async deleteProfile(
    profileId: string,
    authenticatedDeviceId?: string,
  ): Promise<{ success: boolean; message: string }> {
    const lockKey = authenticatedDeviceId || profileId;
    const currentLock = this.deletionLocks.get(lockKey) || Promise.resolve();

    const executeDeletion = async () => {
      const isConfigured = this.supabaseService.isConfigured();
      const allowDemoFallback = this.allowDemoFallback(isConfigured);

      if (isConfigured) {
        const client = this.supabaseService.getClient()!;
        try {
          // 1. Primary: Execute transactional delete RPC with row-level locking (FOR UPDATE)
          const { data: rpcData, error: rpcError } = await this.supabaseService.executeWithRetry(async () =>
            client.rpc('delete_viewing_profile', {
              p_profile_id: profileId,
              p_device_id: authenticatedDeviceId || '',
            }),
          );

          if (!rpcError && rpcData) {
            return rpcData;
          }

          if (rpcError) {
            const msg = (rpcError.message || '').toLowerCase();
            if (rpcError.code === 'P0002' || msg.includes('profile_not_found') || rpcError.code === 'PGRST116') {
              throw new NotFoundException(`Profile with ID '${profileId}' not found`);
            }
            if (msg.includes('service_role_required')) {
              this.logger.error('Database delete_viewing_profile RPC rejected caller: service_role required');
              throw new ServiceUnavailableException('Database authorization failure');
            }
            if (rpcError.code === '42501' || msg.includes('forbidden_device_mismatch')) {
              throw new ForbiddenException('Profile does not belong to the authenticated device');
            }
            if (rpcError.code === '23514' || msg.includes('cannot_delete_sole_profile')) {
              throw new BadRequestException('Cannot delete the sole viewing profile on this device');
            }
            // If the RPC is not defined in mock or un-migrated DBs (42883), fallback to direct query check
            if (rpcError.code !== '42883') {
              this.logger.error(`Database delete_viewing_profile RPC error: ${rpcError.message}`);
              if (!allowDemoFallback) {
                throw new ServiceUnavailableException(`Database delete failed: ${rpcError.message}`);
              }
            }
          }

          // 2. Direct query fallback for DB mocks or environments where the RPC is not yet registered
          const { data: target, error: targetError } = await this.supabaseService.executeWithRetry(async () =>
            client
              .from('profiles')
              .select('id, device_id')
              .eq('id', profileId)
              .single(),
          );

          if (targetError) {
            if (targetError.code === 'PGRST116') {
              throw new NotFoundException(`Profile with ID '${profileId}' not found`);
            }
            this.logger.error(`Database find profile for deletion failed: ${targetError.message}`);
            if (!allowDemoFallback) {
              throw new ServiceUnavailableException(`Database error: ${targetError.message}`);
            }
          } else if (!target) {
            throw new NotFoundException(`Profile with ID '${profileId}' not found`);
          }

          if (target) {
            if (authenticatedDeviceId && target.device_id !== authenticatedDeviceId) {
              throw new ForbiddenException('Profile does not belong to the authenticated device');
            }

            const { count, error: countError } = await this.supabaseService.executeWithRetry(async () =>
              client
                .from('profiles')
                .select('id', { count: 'exact', head: true })
                .eq('device_id', target.device_id),
            );

            if (countError) {
              this.logger.error(`Database count error during deletion: ${countError.message}`);
              if (!allowDemoFallback) {
                throw new ServiceUnavailableException(`Database error: ${countError.message}`);
              }
            }

            if (count !== null && count !== undefined && count <= 1) {
              throw new BadRequestException('Cannot delete the sole viewing profile on this device');
            }

            const { error: deleteError } = await this.supabaseService.executeWithRetry(async () =>
              client
                .from('profiles')
                .delete()
                .eq('id', profileId)
                .eq('device_id', target.device_id),
            );

            if (deleteError) {
              this.logger.error(`Database delete profile error: ${deleteError.message}`);
              if (!allowDemoFallback) {
                throw new ServiceUnavailableException(`Database delete failed: ${deleteError.message}`);
              }
            } else {
              return { success: true, message: `Profile '${profileId}' deleted successfully` };
            }
          }
        } catch (err: any) {
          if (
            err instanceof NotFoundException ||
            err instanceof ForbiddenException ||
            err instanceof BadRequestException ||
            err instanceof ServiceUnavailableException
          ) {
            throw err;
          }
          this.logger.error(`Database profile deletion error: ${err?.message}`);
          if (!allowDemoFallback) {
            throw new ServiceUnavailableException('Database profile deletion failed');
          }
        }
      }

      // In-memory fallback
      const existing = IN_MEMORY_PROFILES.get(profileId);
      if (!existing) {
        throw new NotFoundException(`Profile with ID '${profileId}' not found`);
      }

      if (authenticatedDeviceId && existing.device_id !== authenticatedDeviceId) {
        throw new ForbiddenException('Profile does not belong to the authenticated device');
      }

      const deviceProfiles = Array.from(IN_MEMORY_PROFILES.values()).filter(
        (p) => p.device_id === existing.device_id,
      );
      if (deviceProfiles.length <= 1) {
        throw new BadRequestException('Cannot delete the sole viewing profile on this device');
      }

      IN_MEMORY_PROFILES.delete(profileId);
      return { success: true, message: `Profile '${profileId}' deleted successfully` };
    };

    const nextLock = currentLock.then(executeDeletion, executeDeletion).finally(() => {
      if (this.deletionLocks.get(lockKey) === nextLock) {
        this.deletionLocks.delete(lockKey);
      }
    });

    this.deletionLocks.set(lockKey, nextLock);
    return nextLock;
  }
}
