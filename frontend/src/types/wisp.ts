export type WispActionType =
  | 'contextual_qa'
  | 'entity_explain'
  | 'scene_explain'
  | 'episode_recap'
  | 'post_watch_quiz';

export type HouseholdProfileMode = 'quick_glance' | 'deep_lore' | 'family_friendly';

export interface QuickActionChip {
  id: string;
  label: string;
  actionType: WispActionType;
}

export interface InstantSceneContext {
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
  prior_scenes?: Array<{
    scene_index: number;
    scene_title: string;
    summary: string;
  }>;
  recent_transcript?: Array<{
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

export interface WispQueryRequest {
  episodeId: string;
  playbackPositionMs: number;
  actionType: WispActionType;
  prompt: string;
  profileMode: HouseholdProfileMode;
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
