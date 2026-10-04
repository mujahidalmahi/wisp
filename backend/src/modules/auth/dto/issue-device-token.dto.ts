import { IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';

export class IssueDeviceTokenDto {
  @IsNotEmpty({ message: 'deviceId is required' })
  @IsString({ message: 'deviceId must be a string' })
  @Length(3, 128, { message: 'deviceId must be between 3 and 128 characters' })
  @Matches(/^[a-zA-Z0-9_\-\.:]+$/, {
    message: 'deviceId contains invalid characters (allowed: alphanumeric, _, -, ., :)',
  })
  deviceId: string;

  @IsOptional()
  @IsString({ message: 'deviceSecret must be a string' })
  @Length(16, 256, { message: 'deviceSecret must be between 16 and 256 characters' })
  deviceSecret?: string;

  @IsOptional()
  @IsString({ message: 'enrollmentKey must be a string' })
  @Length(8, 256, { message: 'enrollmentKey must be between 8 and 256 characters' })
  enrollmentKey?: string;
}
