import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum WispActionType {
  CONTEXTUAL_QA = 'contextual_qa',
  ENTITY_EXPLAIN = 'entity_explain',
  SCENE_EXPLAIN = 'scene_explain',
  EPISODE_RECAP = 'episode_recap',
  POST_WATCH_QUIZ = 'post_watch_quiz',
}

export enum HouseholdProfileMode {
  QUICK_GLANCE = 'quick_glance',
  DEEP_LORE = 'deep_lore',
  FAMILY_FRIENDLY = 'family_friendly',
}

export class WispQueryRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  episodeId!: string;

  @IsInt()
  @Min(0)
  @Max(86400000, { message: 'playbackPositionMs cannot exceed 86400000 (24 hours)' })
  playbackPositionMs!: number;

  @IsEnum(WispActionType)
  actionType!: WispActionType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  prompt!: string;

  @IsOptional()
  @IsEnum(HouseholdProfileMode)
  profileMode?: HouseholdProfileMode = HouseholdProfileMode.QUICK_GLANCE;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  profileId?: string;
}


export interface QuickActionChip {
  id: string;
  label: string;
  actionType: WispActionType;
}

export interface WispResponseCardDto {
  headline: string;
  body: string;
  bulletPoints?: string[];
  spoilerSafeUpToMs: number;
  profileMode: HouseholdProfileMode;
  providerUsed: string;
  cached: boolean;
  latencyMs: number;
  followUpChips: QuickActionChip[];
  interactionId?: string;
  quizPayload?: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  };
}
