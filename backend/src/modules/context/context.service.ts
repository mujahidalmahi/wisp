import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  HybridContextSource,
  InMemoryCatalogContextSource,
  TemporalProgramContext,
} from '@wisp/ai-engine';
import { SupabaseService } from '../supabase/supabase.service';
import { CatalogService } from '../catalog/catalog.service';
import { ProfilesService } from '../profiles/profiles.service';

export { TemporalProgramContext };

export interface QuickActionChipItem {
  id?: string;
  label: string;
  actionType?: string;
}

export interface Stage1BootstrapResponse {
  profile: {
    id: string;
    display_name: string;
    mode: string;
    spoiler_strictness: string;
    voice_tts_enabled: boolean;
  } | null;
  active_scene: {
    scene_index: number;
    title: string;
    scene_title: string;
    location_name?: string;
    start_time_ms: number;
    end_time_ms: number;
    summary: string;
    spoiler_safe_summary: string;
    quick_action_chips: QuickActionChipItem[];
  } | null;
  prewarmed_cards: Array<{
    action_type: string;
    provider: string;
    card: Record<string, any>;
  }>;
  session: {
    session_id: string;
    current_playback_ms: number;
    recent_turn_count: number;
    last_summary?: string;
    pinned_timestamps: number[];
  } | null;
  safe_playback_ms: number;
  episode_duration_ms: number;
}

@Injectable()
export class ContextService {
  private readonly logger = new Logger(ContextService.name);
  private readonly contextSource: HybridContextSource;
  private readonly inMemoryFallback = new InMemoryCatalogContextSource();

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly catalogService: CatalogService,
    private readonly profilesService: ProfilesService,
  ) {
    this.contextSource = new HybridContextSource(
      async (episodeId, playbackPositionMs, lookbackMs) => {
        const client = this.supabaseService.getClient();
        if (!client) return null;

        const safeMs = Math.max(0, playbackPositionMs);
        const { data, error } = await this.supabaseService.executeWithRetry(async () =>
          client.rpc('get_spoiler_safe_context', {
            p_episode_id: episodeId,
            p_playback_ms: safeMs,
            p_lookback_ms: lookbackMs,
          }),
        );

        if (error || !data) {
          this.logger.warn(`Supabase RPC fallback to in-memory context: ${error?.message}`);
          return null;
        }
        return data as TemporalProgramContext;
      },
      this.inMemoryFallback,
    );
  }

  getHybridContextSource(): HybridContextSource {
    return this.contextSource;
  }

  private allowDemoFallback(isConfigured: boolean): boolean {
    const isProduction = process.env.NODE_ENV === 'production';
    return !isConfigured || (!isProduction && process.env.ENABLE_DEMO_FALLBACK === 'true');
  }

  async getSpoilerSafeContext(
    episodeId: string,
    playbackPositionMs: number,
    lookbackMs = 120000,
  ): Promise<TemporalProgramContext> {
    const safeMs = Math.max(0, playbackPositionMs);
    const isConfigured = this.supabaseService.isConfigured();
    const allowDemoFallback = this.allowDemoFallback(isConfigured);

    // Strict Production Database Path: Verify episode exists and do not fall back to demo fixtures on misses (Item 5)
    if (isConfigured) {
      const client = this.supabaseService.getClient()!;
      try {
        const { data, error } = await this.supabaseService.executeWithRetry(async () =>
          client.rpc('get_spoiler_safe_context', {
            p_episode_id: episodeId,
            p_playback_ms: safeMs,
            p_lookback_ms: lookbackMs,
          }),
        );

        if (error) {
          if (error.code === 'PGRST116' || error.code === 'P0002' || error.code === '22P02') {
            throw new NotFoundException(`Playable episode with ID '${episodeId}' not found`);
          }
          this.logger.error(`Database RPC get_spoiler_safe_context failed: ${error.message}`);
          if (!allowDemoFallback) {
            throw new ServiceUnavailableException(`Database context query failed: ${error.message}`);
          }
        } else if (data) {
          return data as TemporalProgramContext;
        } else {
          // Explicit Not Found when database returns null for unknown episode (Item 5)
          throw new NotFoundException(`Playable episode with ID '${episodeId}' not found`);
        }
      } catch (err: any) {
        if (err instanceof NotFoundException || err instanceof ServiceUnavailableException) throw err;
        this.logger.error(`Error querying database context: ${err?.message}`);
        if (!allowDemoFallback) {
          throw new ServiceUnavailableException('Database context query failed');
        }
      }
    }

    // Standalone fallback path with lookbackMs propagation and episode verification
    await this.catalogService.getEpisodeById(episodeId);
    return this.contextSource.getSpoilerSafeContext(episodeId, safeMs, lookbackMs);
  }

  /**
   * Stage-1 Single-Roundtrip Fire TV Bootstrap RPC
   * Fast-path latency critical: zero retries on bootstrap to guarantee predictable response times.
   */
  async getFireTvBootstrap(
    episodeId: string,
    deviceId: string,
    playbackPositionMs = 0,
    profileId?: string,
  ): Promise<Stage1BootstrapResponse> {
    const cleanDeviceId = deviceId.trim();
    const cleanProfileId = profileId ? profileId.trim() : undefined;
    const safeMs = Math.max(0, playbackPositionMs);
    const isConfigured = this.supabaseService.isConfigured();
    const allowDemoFallback = this.allowDemoFallback(isConfigured);

    // 1. Verify profile-to-device ownership and existence (fail fast on not-found or mismatch)
    if (cleanProfileId) {
      if (isConfigured) {
        const client = this.supabaseService.getClient()!;
        const { data: profileCheck, error: checkError } = await this.supabaseService.executeWithRetry(async () =>
          client
            .from('profiles')
            .select('id, device_id')
            .eq('id', cleanProfileId)
            .single(),
        );

        if (checkError?.code === 'PGRST116' || (!checkError && !profileCheck)) {
          throw new NotFoundException(`Profile '${cleanProfileId}' not found`);
        }
        if (profileCheck && profileCheck.device_id !== cleanDeviceId) {
          throw new ForbiddenException(
            `Profile '${cleanProfileId}' does not belong to device '${cleanDeviceId}'`,
          );
        }
        if (checkError && !allowDemoFallback) {
          throw new ServiceUnavailableException(`Database error verifying profile: ${checkError.message}`);
        }
      } else {
        const profile = await this.profilesService.getProfileById(cleanProfileId);
        if (!profile) {
          throw new NotFoundException(`Profile '${cleanProfileId}' not found`);
        }
        if (profile.device_id !== cleanDeviceId) {
          throw new ForbiddenException(
            `Profile '${cleanProfileId}' does not belong to device '${cleanDeviceId}'`,
          );
        }
      }
    }

    // 2. Production Database Path via get_firetv_stage1_bootstrap RPC
    if (isConfigured) {
      const client = this.supabaseService.getClient()!;
      try {
        const params: Record<string, any> = {
          p_episode_id: episodeId,
          p_device_id: cleanDeviceId,
          p_playback_ms: safeMs,
        };
        if (cleanProfileId) {
          params.p_profile_id = cleanProfileId;
        }

        // Fast-path latency critical: maxRetries: 0 so retries never block the bootstrap deadline (Item 13)
        const { data, error } = await this.supabaseService.executeWithRetry(
          async () => client.rpc('get_firetv_stage1_bootstrap', params),
          { maxRetries: 0 },
        );

        if (!error && data) {
          const payload = data as any;
          if (payload.found === false) {
            throw new NotFoundException(`Playable episode with ID '${episodeId}' not found`);
          }

          if (
            payload.active_scene &&
            (Object.keys(payload.active_scene).length === 0 ||
              (!payload.active_scene.title && !payload.active_scene.scene_title))
          ) {
            payload.active_scene = null;
          } else if (payload.active_scene) {
            payload.active_scene.title = payload.active_scene.title || payload.active_scene.scene_title;
            payload.active_scene.scene_title = payload.active_scene.scene_title || payload.active_scene.title;
            payload.active_scene.summary = payload.active_scene.summary || payload.active_scene.spoiler_safe_summary;
            payload.active_scene.spoiler_safe_summary =
              payload.active_scene.spoiler_safe_summary || payload.active_scene.summary;
            if (
              !payload.active_scene.quick_action_chips ||
              payload.active_scene.quick_action_chips.length === 0
            ) {
              payload.active_scene.quick_action_chips = this.getDefaultQuickActionChips();
            }
          }

          if (payload.session && Object.keys(payload.session).length === 0) {
            payload.session = null;
          }
          if (payload.profile && Object.keys(payload.profile).length === 0) {
            payload.profile = null;
          }

          return payload as Stage1BootstrapResponse;
        }

        if (error) {
          if (error.code === 'PGRST116' || error.code === 'P0002' || error.code === '22P02') {
            throw new NotFoundException(`Playable episode with ID '${episodeId}' not found`);
          }
          this.logger.error(`get_firetv_stage1_bootstrap RPC failed: ${error.message}`);
          if (!allowDemoFallback) {
            throw new ServiceUnavailableException(`Database bootstrap unavailable: ${error.message}`);
          }
        }
      } catch (err: any) {
        if (
          err instanceof NotFoundException ||
          err instanceof ForbiddenException ||
          err instanceof ServiceUnavailableException
        ) {
          throw err;
        }
        this.logger.error(`Error calling get_firetv_stage1_bootstrap: ${err?.message}`);
        if (!allowDemoFallback) {
          throw new ServiceUnavailableException('Database bootstrap unavailable');
        }
      }
    }

    // 3. Resilient In-Memory Fallback Path (only for standalone / unconfigured mode)
    const ep = await this.catalogService.getEpisodeById(episodeId);
    const episodeDurationMs = ep?.duration_ms ?? 0;
    const clampedPlaybackMs =
      episodeDurationMs > 0
        ? Math.min(Math.max(0, safeMs), episodeDurationMs)
        : Math.max(0, safeMs);

    const context = await this.inMemoryFallback.getSpoilerSafeContext(episodeId, clampedPlaybackMs);
    const activeScene = context.active_scene;

    // Resolve profile from storage if profileId provided; otherwise return null
    let resolvedProfile: Stage1BootstrapResponse['profile'] = null;
    if (cleanProfileId) {
      const p = await this.profilesService.getProfileById(cleanProfileId);
      if (!p) {
        throw new NotFoundException(`Profile '${cleanProfileId}' not found`);
      }
      if (p.device_id !== cleanDeviceId) {
        throw new ForbiddenException(
          `Profile '${cleanProfileId}' does not belong to device '${cleanDeviceId}'`,
        );
      }
      resolvedProfile = {
        id: p.id,
        display_name: p.display_name,
        mode: p.mode,
        spoiler_strictness: p.spoiler_strictness,
        voice_tts_enabled: p.voice_tts_enabled,
      };
    }

    const chips: QuickActionChipItem[] =
      activeScene?.quick_action_chips && activeScene.quick_action_chips.length >= 2
        ? activeScene.quick_action_chips.map((c) => ({
            id: c.id,
            label: c.label,
            actionType: c.actionType,
          }))
        : this.getDefaultQuickActionChips();

    return {
      profile: resolvedProfile,
      active_scene: activeScene
        ? {
            scene_index: activeScene.scene_index,
            title: activeScene.scene_title,
            scene_title: activeScene.scene_title,
            location_name: activeScene.location_name,
            start_time_ms: 0,
            end_time_ms: Math.min(
              clampedPlaybackMs + 30000,
              episodeDurationMs > 0 ? episodeDurationMs : clampedPlaybackMs + 30000,
            ),
            summary: activeScene.spoiler_safe_summary,
            spoiler_safe_summary: activeScene.spoiler_safe_summary,
            quick_action_chips: chips,
          }
        : null,
      prewarmed_cards: activeScene
        ? [
            {
              action_type: 'scene_explain',
              provider: 'groq',
              card: {
                headline: 'Active Scene Context',
                summary: activeScene.spoiler_safe_summary,
                spoilerSafeUpToMs: clampedPlaybackMs,
                followUpActions: ['Tell me more', 'Characters here'],
              },
            },
          ]
        : [],
      session: null, // Do not fabricate fake session IDs (Item 7)
      safe_playback_ms: clampedPlaybackMs,
      episode_duration_ms: episodeDurationMs,
    };
  }

  private getDefaultQuickActionChips(): QuickActionChipItem[] {
    return [
      { id: 'chip-scene', label: 'Explain Scene', actionType: 'scene_explain' },
      { id: 'chip-characters', label: 'Who is on screen?', actionType: 'character_identify' },
      { id: 'chip-recap', label: 'Quick Recap', actionType: 'recap' },
    ];
  }
}
