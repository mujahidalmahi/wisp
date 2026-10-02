import {
  ForbiddenException,
  Injectable,
  Logger,
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
    location_name?: string;
    start_time_ms: number;
    end_time_ms: number;
    summary: string;
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

  async getSpoilerSafeContext(
    episodeId: string,
    playbackPositionMs: number,
    lookbackMs = 120000,
  ): Promise<TemporalProgramContext> {
    const safeMs = Math.max(0, playbackPositionMs);
    // Propagate lookbackMs through to the ContextSource implementation (Item 6)
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
    const client = this.supabaseService.getClient();

    // 1. Verify profile-to-device ownership before proceeding (Item 2)
    if (cleanProfileId) {
      if (client) {
        const { data: profileCheck } = await this.supabaseService.executeWithRetry(async () =>
          client
            .from('profiles')
            .select('id, device_id')
            .eq('id', cleanProfileId)
            .single(),
        );

        if (profileCheck && profileCheck.device_id !== cleanDeviceId) {
          throw new ForbiddenException(
            `Profile '${cleanProfileId}' does not belong to device '${cleanDeviceId}'`,
          );
        }
      } else {
        const profile = await this.profilesService.getProfileById(cleanProfileId);
        if (profile && profile.device_id !== cleanDeviceId) {
          throw new ForbiddenException(
            `Profile '${cleanProfileId}' does not belong to device '${cleanDeviceId}'`,
          );
        }
      }
    }

    if (client) {
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
          const payload = data as Stage1BootstrapResponse;
          // Ensure zero-typing quick action chips invariant (Rule #4)
          if (
            payload.active_scene &&
            (!payload.active_scene.quick_action_chips ||
              payload.active_scene.quick_action_chips.length === 0)
          ) {
            payload.active_scene.quick_action_chips = this.getDefaultQuickActionChips();
          }
          return payload;
        }
        if (error) {
          this.logger.warn(
            `get_firetv_stage1_bootstrap RPC failed: ${error.message}. Using resilient fallback.`,
          );
        }
      } catch (err: any) {
        if (err instanceof ForbiddenException) throw err;
        this.logger.warn(`Error calling get_firetv_stage1_bootstrap: ${err?.message}. Using resilient fallback.`);
      }
    }

    // 2. High-performance fallback without fabricating unverified profile/session state (Item 7)
    const context = await this.inMemoryFallback.getSpoilerSafeContext(episodeId, safeMs);
    const activeScene = context.active_scene;

    // Resolve episode duration from catalog data instead of fixed constant
    let episodeDurationMs = 0;
    try {
      const ep = await this.catalogService.getEpisodeById(episodeId);
      episodeDurationMs = ep?.duration_ms ?? 0;
    } catch {
      episodeDurationMs = 0;
    }

    // Resolve profile from storage if profileId provided; otherwise return null
    let resolvedProfile: Stage1BootstrapResponse['profile'] = null;
    if (cleanProfileId) {
      const p = await this.profilesService.getProfileById(cleanProfileId);
      if (p && p.device_id === cleanDeviceId) {
        resolvedProfile = {
          id: p.id,
          display_name: p.display_name,
          mode: p.mode,
          spoiler_strictness: p.spoiler_strictness,
          voice_tts_enabled: p.voice_tts_enabled,
        };
      }
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
            location_name: activeScene.location_name,
            start_time_ms: 0,
            end_time_ms: safeMs + 30000,
            summary: activeScene.spoiler_safe_summary,
            quick_action_chips: chips,
          }
        : {
            scene_index: 1,
            title: 'Initial Scene',
            start_time_ms: 0,
            end_time_ms: 60000,
            summary: 'Playback starting...',
            quick_action_chips: chips,
          },
      prewarmed_cards: [
        {
          action_type: 'scene_explain',
          provider: 'groq',
          card: {
            headline: 'Active Scene Context',
            summary: activeScene?.spoiler_safe_summary || 'Contextual viewing ready.',
            spoilerSafeUpToMs: safeMs,
            followUpActions: ['Tell me more', 'Characters here'],
          },
        },
      ],
      session: null, // Do not fabricate fake session IDs (Item 7)
      safe_playback_ms: safeMs,
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
