import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { HouseholdProfileMode } from '../../../common/dto/wisp-query.dto';

export class CreateProfileDto {
  @IsNotEmpty({ message: 'deviceId is required' })
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  deviceId: string;

  @IsNotEmpty({ message: 'displayName is required' })
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  displayName: string;

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
  @MaxLength(20)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  avatarColor?: string;
}
