import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GetProfilesQueryDto {
  @IsNotEmpty({ message: 'deviceId query parameter is required' })
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  deviceId: string;
}
