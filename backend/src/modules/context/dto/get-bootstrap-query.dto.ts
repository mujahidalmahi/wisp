import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class GetBootstrapQueryDto {
  @IsNotEmpty({ message: 'deviceId is required' })
  @IsString()
  deviceId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'playbackMs must be an integer' })
  @Min(0, { message: 'playbackMs must be greater than or equal to 0' })
  playbackMs?: number = 0;

  @IsOptional()
  @IsUUID('all', { message: 'profileId must be a valid UUID' })
  profileId?: string;
}
