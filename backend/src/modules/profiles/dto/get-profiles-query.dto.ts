import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GetProfilesQueryDto {
  @IsNotEmpty({ message: 'deviceId query parameter is required' })
  @IsString()
  @MaxLength(100)
  deviceId: string;
}
