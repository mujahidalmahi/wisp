import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class GetContextQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'playbackMs must be an integer' })
  @Min(0, { message: 'playbackMs must be greater than or equal to 0' })
  playbackMs?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'lookbackMs must be an integer' })
  @Min(0, { message: 'lookbackMs must be greater than or equal to 0' })
  lookbackMs?: number = 120000;
}
