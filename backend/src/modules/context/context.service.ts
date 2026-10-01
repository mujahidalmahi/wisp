import { Injectable, Logger } from '@nestjs/common';
import {
  HybridContextSource,
  InMemoryCatalogContextSource,
  TemporalProgramContext,
} from '@wisp/ai-engine';
import { SupabaseService } from '../supabase/supabase.service';

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

  constructor(private readonly supabaseService: SupabaseService) {
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
          this.logger.warn(`Supabase RPC fallback to @wisp/ai-engine in-memory catalog: ${error?.message}`);
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
    return this.contextSource.getSpoilerSafeContext(episodeId, safeMs);
  }

  /**
   * Stage-1 Single-Roundtrip Fire TV Bootstrap RPC
   * Returns active scene, D-pad quick action chips, verified pre-warmed cache cards,
   * and claim-bound profile/session state in <50ms.
   */
  async getFireTvBootstrap(
    episodeId: string,
    deviceId: string,
    playbackPositionMs = 0,
    profileId?: string,
  ): Promise<Stage1BootstrapResponse> {
    const cleanDeviceId = deviceId.trim();
    const safeMs = Math.max(0, playbackPositionMs);
    const client = this.supabaseService.getClient();

    if (client) {
      try {
        const params: Record<string, any> = {
          p_episode_id: episodeId,
          p_device_id: cleanDeviceId,
          p_playback_ms: safeMs,
        };
        if (profileId) {
          params.p_profile_id = profileId.trim();
        }

        const { data, error } = await this.supabaseService.executeWithRetry(async () =>
          client.rpc('get_firetv_stage1_bootstrap', params),
        );

        if (!error && data) {
          const payload = data as Stage1BootstrapResponse;
          // Ensure zero-typing quick action chips invariant (Rule #4)
          if (payload.active_scene && (!payload.active_scene.quick_action_chips || payload.active_scene.quick_action_chips.length === 0)) {
            payload.active_scene.quick_action_chips = this.getDefaultQuickActionChips();
          }
          return payload;
        }
        if (error) {
          this.logger.warn(`get_firetv_stage1_bootstrap RPC failed: ${error.message}. Using in-memory fallback.`);
        }
      } catch (err: any) {
        this.logger.warn(`Error calling get_firetv_stage1_bootstrap: ${err?.message}. Using in-memory fallback.`);
      }
    }

    // High-performance standalone in-memory fallback
    const context = await this.inMemoryFallback.getSpoilerSafeContext(episodeId, safeMs);
    const activeScene = context.active_scene;

    const chips: QuickActionChipItem[] =
      activeScene?.quick_action_chips && activeScene.quick_action_chips.length >= 2
        ? activeScene.quick_action_chips.map((c) => ({
            id: c.id,
            label: c.label,
            actionType: c.actionType,
          }))
        : this.getDefaultQuickActionChips();

    return {
      profile: {
        id: profileId || '11111111-1111-1111-1111-111111111111',
        display_name: 'Living Room TV',
        mode: 'quick_glance',
        spoiler_strictness: 'strict',
        voice_tts_enabled: false,
      },
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
      session: {
        session_id: 'session-demo-01',
        current_playback_ms: safeMs,
        recent_turn_count: 0,
        pinned_timestamps: [],
      },
      safe_playback_ms: safeMs,
      episode_duration_ms: 734000,
    };
  }

  private getDefaultQuickActionChips(): QuickActionChipItem[] {
    return [
      { id: 'chip-1', label: 'Who is Thom?', actionType: 'entity_explain' },
      { id: 'chip-2', label: 'Explain the Beacon', actionType: 'scene_explain' },
      { id: 'chip-3', label: 'What just happened?', actionType: 'contextual_qa' },
    ];
  }
}
