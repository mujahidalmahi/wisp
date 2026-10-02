export interface QuickActionChip {
  id: string;
  label: string;
  actionType: string;
}

export interface TemporalProgramContext {
  metadata: {
    program_title: string;
    genre: string;
    episode_title: string;
    season_number: number;
    episode_number: number;
    playback_position_ms: number;
  };
  active_scene: {
    scene_index: number;
    scene_title: string;
    location_name: string;
    spoiler_safe_summary: string;
    quick_action_chips: QuickActionChip[];
  };
  prior_scenes: Array<{
    scene_index: number;
    scene_title: string;
    summary: string;
  }>;
  recent_transcript: Array<{
    start_time_ms: number;
    end_time_ms: number;
    speaker: string;
    dialogue: string;
    visual_cue?: string;
  }>;
  unlocked_entities: Array<{
    name: string;
    type: string;
    base_description: string;
    progressive_fact: string;
    in_current_scene: boolean;
  }>;
}

export interface ContextSource {
  getSpoilerSafeContext(
    episodeId: string,
    playbackPositionMs: number,
    lookbackMs?: number,
  ): Promise<TemporalProgramContext>;
}

export declare class InMemoryCatalogContextSource implements ContextSource {
  constructor();
  getSpoilerSafeContext(
    episodeId: string,
    playbackPositionMs: number,
    lookbackMs?: number,
  ): Promise<TemporalProgramContext>;
}

export declare class HybridContextSource implements ContextSource {
  constructor(
    dbSource: (
      episodeId: string,
      playbackPositionMs: number,
      lookbackMs: number,
    ) => Promise<TemporalProgramContext | null>,
    fallbackSource?: ContextSource,
  );
  getSpoilerSafeContext(
    episodeId: string,
    playbackPositionMs: number,
    lookbackMs?: number,
  ): Promise<TemporalProgramContext>;
}

export interface WispAiEngineConfig {
  groqApiKey?: string;
  groqModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  openRouterApiKey?: string;
  openRouterModel?: string;
  ollamaBaseUrl?: string;
  ollamaModel?: string;
  enableCache?: boolean;
}

export interface FeatureExecutionPayload {
  episodeId: string;
  playbackPositionMs: number;
  actionType: string;
  prompt: string;
  profileMode: string;
}

export declare class WispAiEngine {
  constructor(config: WispAiEngineConfig, contextSource?: ContextSource);
  listFeatures(): string[];
  execute(payload: FeatureExecutionPayload): Promise<any>;
}
