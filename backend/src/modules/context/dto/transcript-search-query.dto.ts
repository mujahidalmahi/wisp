import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class TranscriptSearchQueryDto {
  @Type(() => Number)
  @IsInt({ message: 'playbackMs must be an integer' })
  @Min(0, { message: 'playbackMs must be greater than or equal to 0' })
  @Max(86400000, { message: 'playbackMs cannot exceed 86400000 (24 hours)' })
  playbackMs: number;

  @IsString({ message: 'query must be a string' })
  @IsNotEmpty({ message: 'query cannot be empty' })
  @MaxLength(300, { message: 'query cannot exceed 300 characters' })
  query: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(50, { message: 'limit cannot exceed 50' })
  limit?: number = 10;
}
