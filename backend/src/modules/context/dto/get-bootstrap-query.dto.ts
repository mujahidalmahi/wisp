import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class GetBootstrapQueryDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  deviceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'playbackMs must be an integer' })
  @Min(0, { message: 'playbackMs must be greater than or equal to 0' })
  @Max(86400000, { message: 'playbackMs cannot exceed 86400000 (24 hours)' })
  playbackMs?: number = 0;

  @IsOptional()
  @IsUUID('all', { message: 'profileId must be a valid UUID' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  profileId?: string;
}
