import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { DeviceTokenService } from '../../common/auth/device-token.service';
import { IssueDeviceTokenDto } from './dto/issue-device-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly deviceTokenService: DeviceTokenService) {}

  /**
   * Authenticates device enrollment or token renewal and issues a signed JWT token.
   * Requires proof of authorization via deviceSecret or fleet enrollmentKey.
   * Prevents arbitrary unauthenticated callers from minting tokens for other devices.
   */
  @Post('device-token')
  @HttpCode(HttpStatus.OK)
  issueDeviceToken(
    @Body() dto: IssueDeviceTokenDto,
    @Headers('x-enrollment-key') headerEnrollmentKey?: string,
    @Headers('x-device-secret') headerDeviceSecret?: string,
  ) {
    const enrollmentKey = dto.enrollmentKey || headerEnrollmentKey;
    const deviceSecret = dto.deviceSecret || headerDeviceSecret;

    return this.deviceTokenService.authenticateAndIssueToken(
      dto.deviceId,
      { enrollmentKey, deviceSecret },
    );
  }

  /**
   * Dedicated enrollment endpoint for Fire TV initial device provisioning.
   */
  @Post('enroll')
  @HttpCode(HttpStatus.OK)
  enrollDevice(
    @Body() dto: IssueDeviceTokenDto,
    @Headers('x-enrollment-key') headerEnrollmentKey?: string,
  ) {
    const enrollmentKey = dto.enrollmentKey || headerEnrollmentKey;
    return this.deviceTokenService.authenticateAndIssueToken(
      dto.deviceId,
      { enrollmentKey },
    );
  }
}
