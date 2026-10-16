import { Type } from 'class-transformer';
import { IsInt, Min, Max } from 'class-validator';

export class CrossEpisodeQueryDto {
  @Type(() => Number)
  @IsInt({ message: 'playbackMs must be an integer' })
  @Min(0, { message: 'playbackMs must be greater than or equal to 0' })
  @Max(86400000, { message: 'playbackMs cannot exceed 86400000 (24 hours)' })
  playbackMs: number;
}
