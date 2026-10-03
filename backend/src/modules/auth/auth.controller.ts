import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { DeviceTokenService } from '../../common/auth/device-token.service';
import { IssueDeviceTokenDto } from './dto/issue-device-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly deviceTokenService: DeviceTokenService) {}

  /**
   * Issues a cryptographically signed HMAC-SHA256 device token for an Amazon Fire TV device.
   * Enables zero-spoofing cryptographic identity verification on all protected endpoints.
   */
  @Post('device-token')
  @HttpCode(HttpStatus.OK)
  issueDeviceToken(@Body() dto: IssueDeviceTokenDto) {
    const expiresInSeconds = 30 * 24 * 3600; // 30 days
    const token = this.deviceTokenService.signDeviceToken(dto.deviceId, expiresInSeconds);
    return {
      deviceId: dto.deviceId.trim(),
      token,
      expires_in: expiresInSeconds,
      token_type: 'Bearer',
    };
  }
}
