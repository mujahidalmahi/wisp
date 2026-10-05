import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetContextQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'playbackMs must be an integer' })
  @Min(0, { message: 'playbackMs must be greater than or equal to 0' })
  @Max(86400000, { message: 'playbackMs cannot exceed 86400000 (24 hours)' })
  playbackMs?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'lookbackMs must be an integer' })
  @Min(0, { message: 'lookbackMs must be greater than or equal to 0' })
  @Max(3600000, { message: 'lookbackMs cannot exceed 3600000 (1 hour)' })
  lookbackMs?: number = 120000;
}
