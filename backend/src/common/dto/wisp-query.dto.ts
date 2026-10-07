import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
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
  episodeId!: string;

  @IsInt()
  @Min(0)
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
  quizPayload?: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  };
}
