export type WispActionType =
  | 'contextual_qa'
  | 'entity_explain'
  | 'scene_explain'
  | 'episode_recap'
  | 'post_watch_quiz'
  | (string & {}); // Extensible for new custom AI features

export type HouseholdProfileMode = 'quick_glance' | 'deep_lore' | 'family_friendly';

export interface QuickActionChip {
  id: string;
  label: string;
  actionType: WispActionType;
}

export interface RawEpisodeDataset {
  episodeId: string;
  programTitle: string;
  genre: string;
  episodeTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  scenes: Array<{
    sceneIndex: number;
    startTimeMs: number;
    endTimeMs: number;
    sceneTitle: string;
    locationName: string;
    spoilerSafeSummary: string;
    quickActionChips: QuickActionChip[];
  }>;
  transcriptSegments: Array<{
    startTimeMs: number;
    endTimeMs: number;
    speaker: string;
    dialogue: string;
    visualCue?: string;
  }>;
  entities: Array<{
    slug: string;
    name: string;
    type: 'character' | 'location' | 'concept' | 'object';
    baseDescription: string;
    appearances: Array<{
      startTimeMs: number;
      endTimeMs: number;
      revealTimeMs: number;
      progressiveFact: string;
    }>;
  }>;
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

export interface AiQueryInput {
  episodeId: string;
  playbackPositionMs: number;
  actionType: WispActionType;
  prompt: string;
  profileMode?: HouseholdProfileMode;
  /**
   * Optional inline context override so callers can execute AI features
   * with ad-hoc scene/transcript data without any database or catalog lookup.
   */
  inlineContextOverride?: TemporalProgramContext;
}

export interface WispResponseCard {
  headline: string;
  body: string;
  bulletPoints?: string[];
  spoilerSafeUpToMs: number;
  profileMode: HouseholdProfileMode;
  providerUsed: string;
  cached: boolean;
  latencyMs: number;
  followUpChips: QuickActionChip[];
  quizPayload?: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  };
}

/**
 * Pluggable Context Source interface (Decouples AI features from Supabase/Backend)
 */
export interface IContextSource {
  readonly sourceName: string;
  getSpoilerSafeContext(
    episodeId: string,
    playbackPositionMs: number,
    lookbackMs?: number,
  ): Promise<TemporalProgramContext>;
}

/**
 * Pluggable AI Model Provider Adapter interface
 */
export interface AiCompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * Abort signal injected by {@link AiProviderRouter} to bound a single provider
   * attempt. Adapters must forward this to `fetch` so the underlying socket is
   * released, not merely abandoned.
   */
  signal?: AbortSignal;
}

export interface AiCompletionResult {
  providerName: string;
  rawText: string;
  latencyMs: number;
}

export interface IAiModelAdapter {
  readonly name: string;
  /**
   * Per-provider wall-clock budget in milliseconds. Falls back to the router
   * default when omitted, so custom adapters stay bounded without changes.
   */
  readonly timeoutMs?: number;
  isConfigured(): boolean;
  complete(request: AiCompletionRequest): Promise<AiCompletionResult>;
}

/**
 * Predicate deciding whether an actionType can actually be dispatched by the
 * engine. Backed by AiFeatureRegistry at runtime so dynamically registered
 * features validate without being coerced.
 */
export type ActionTypeResolver = (actionType: string) => boolean;

/**
 * Pluggable AI Feature Module interface
 * Each feature (Q&A, Entity Explain, Scene Explain, Recap, Quiz, or new features)
 * builds its own specialized prompts and post-processes the response card.
 */
export interface IAiFeatureModule {
  readonly actionType: WispActionType;
  readonly description: string;
  buildPrompts(
    input: AiQueryInput,
    context: TemporalProgramContext,
    profileMode: HouseholdProfileMode,
  ): AiCompletionRequest;
  formatResponseCard(
    rawModelOutput: string,
    input: AiQueryInput,
    context: TemporalProgramContext,
    profileMode: HouseholdProfileMode,
    providerName: string,
    latencyMs: number,
    canResolveActionType?: ActionTypeResolver,
  ): WispResponseCard;
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
  /** Default per-provider attempt budget in ms. Individual adapters may override. */
  providerTimeoutMs?: number;
  /**
   * How long a provider is skipped after a credential or model-not-found fault.
   * Expires automatically so a rotated key recovers without a restart.
   */
  providerQuarantineMs?: number;
}
