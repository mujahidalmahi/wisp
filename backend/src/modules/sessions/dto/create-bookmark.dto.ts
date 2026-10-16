import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateBookmarkDto {
  @IsInt()
  @Min(0)
  @Max(86400000, { message: 'playbackPositionMs cannot exceed 86400000 (24 hours)' })
  playbackPositionMs!: number;

  @IsString()
  @IsNotEmpty({ message: 'label is required' })
  @MaxLength(200, { message: 'label cannot exceed 200 characters' })
  label!: string;

  @IsOptional()
  @IsObject()
  aiCard?: Record<string, any>;

  @IsOptional()
  @IsUUID('all')
  interactionId?: string;

  @IsOptional()
  @IsUUID('all')
  profileId?: string;
}

