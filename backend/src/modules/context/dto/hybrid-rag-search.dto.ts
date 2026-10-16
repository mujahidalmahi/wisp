import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class HybridRagSearchDto {
  @Type(() => Number)
  @IsInt({ message: 'playbackPositionMs must be an integer' })
  @Min(0, { message: 'playbackPositionMs must be greater than or equal to 0' })
  @Max(86400000, { message: 'playbackPositionMs cannot exceed 86400000 (24 hours)' })
  playbackPositionMs: number;

  @IsString({ message: 'queryText must be a string' })
  @IsNotEmpty({ message: 'queryText cannot be empty' })
  @MaxLength(500, { message: 'queryText cannot exceed 500 characters' })
  queryText: string;

  @IsOptional()
  @IsArray({ message: 'queryVector must be an array of numbers' })
  @IsNumber({}, { each: true, message: 'Each element in queryVector must be a number' })
  queryVector?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(20, { message: 'limit cannot exceed 20' })
  limit?: number = 6;
}
