import {
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateBookmarkDto {
  @IsInt()
  @Min(0)
  playbackPositionMs!: number;

  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsOptional()
  @IsObject()
  aiCard?: Record<string, any>;

  @IsOptional()
  @IsUUID('4')
  interactionId?: string;

  @IsOptional()
  @IsUUID('4')
  profileId?: string;
}
