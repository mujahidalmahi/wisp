import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class IssueDeviceTokenDto {
  @IsNotEmpty({ message: 'deviceId is required' })
  @IsString({ message: 'deviceId must be a string' })
  @Length(3, 128, { message: 'deviceId must be between 3 and 128 characters' })
  @Matches(/^[a-zA-Z0-9_\-\.:]+$/, {
    message: 'deviceId contains invalid characters (allowed: alphanumeric, _, -, ., :)',
  })
  deviceId: string;
}
