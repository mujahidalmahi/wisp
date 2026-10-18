import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { HouseholdProfileMode } from '../../../common/dto/wisp-query.dto';

export class EpisodeQuizQueryDto {
  @Type(() => Number)
  @IsInt({ message: 'playbackMs must be an integer' })
  @Min(0, { message: 'playbackMs must be greater than or equal to 0' })
  @Max(86400000, { message: 'playbackMs cannot exceed 86400000 (24 hours)' })
  playbackMs: number;

  @IsOptional()
  @IsEnum(HouseholdProfileMode, {
    message: 'profileMode must be quick_glance, deep_lore, or family_friendly',
  })
  profileMode?: HouseholdProfileMode = HouseholdProfileMode.QUICK_GLANCE;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(20, { message: 'limit cannot exceed 20' })
  limit?: number = 5;
}
