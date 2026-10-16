import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { HouseholdProfileMode } from '../../../common/dto/wisp-query.dto';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'displayName cannot be empty' })
  @MaxLength(50, { message: 'displayName cannot exceed 50 characters' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  displayName?: string;

  @IsOptional()
  @IsEnum(HouseholdProfileMode, {
    message: 'mode must be one of: quick_glance, deep_lore, family_friendly',
  })
  mode?: HouseholdProfileMode;

  @IsOptional()
  @IsIn(['strict', 'moderate', 'off'], {
    message: 'spoilerStrictness must be one of: strict, moderate, off',
  })
  spoilerStrictness?: string;

  @IsOptional()
  @IsBoolean()
  voiceTtsEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'avatarColor must be a valid 6-character hex color (e.g. #4f46e5)',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  avatarColor?: string;
}

