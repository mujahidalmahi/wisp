import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { DeviceTokenService } from '../../common/auth/device-token.service';
import {
  IssueDeviceTokenDto,
  PreAuthorizeDeviceDto,
  RevokeDeviceDto,
} from './dto/issue-device-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly deviceTokenService: DeviceTokenService) {}

  private verifyOperatorAuth(authHeader?: string, operatorTokenHeader?: string): boolean {
    const expected = process.env.INTERNAL_OPERATOR_TOKEN || process.env.OPERATOR_TOKEN;
    if (!expected || expected.trim().length === 0) return false;
    const candidate =
      operatorTokenHeader?.trim() ||
      (authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined);
    if (!candidate) return false;
    const candBuf = Buffer.from(candidate);
    const expBuf = Buffer.from(expected.trim());
    return candBuf.length === expBuf.length && crypto.timingSafeEqual(candBuf, expBuf);
  }

  /**
   * Dedicated enrollment endpoint for Fire TV initial device provisioning.
   * Requires a single-use pre-authorized enrollment code or authenticated operator bypass.
   * Prevents arbitrary callers from registering unauthorized device IDs.
   */
  @Post('enroll')
  @HttpCode(HttpStatus.OK)
  enrollDevice(
    @Body() dto: IssueDeviceTokenDto,
    @Headers('x-enrollment-code') headerEnrollmentCode?: string,
    @Headers('x-operator-token') operatorToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const isOperator = this.verifyOperatorAuth(authHeader, operatorToken);
    const enrollmentCode = dto.enrollmentCode || headerEnrollmentCode;

    return this.deviceTokenService.authenticateAndIssueToken(dto.deviceId, {
      enrollmentCode,
      enrollmentKey: dto.enrollmentKey,
      isOperatorAuthorized: isOperator,
    });
  }

  /**
   * Token renewal endpoint:
   * Requires verified deviceSecret issued during enrollment.
   */
  @Post('device-token')
  @HttpCode(HttpStatus.OK)
  issueDeviceToken(
    @Body() dto: IssueDeviceTokenDto,
    @Headers('x-device-secret') headerDeviceSecret?: string,
    @Headers('x-enrollment-code') headerEnrollmentCode?: string,
    @Headers('x-operator-token') operatorToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const isOperator = this.verifyOperatorAuth(authHeader, operatorToken);
    const deviceSecret = dto.deviceSecret || headerDeviceSecret;
    const enrollmentCode = dto.enrollmentCode || headerEnrollmentCode;

    return this.deviceTokenService.authenticateAndIssueToken(dto.deviceId, {
      deviceSecret,
      enrollmentCode,
      enrollmentKey: dto.enrollmentKey,
      isOperatorAuthorized: isOperator,
    });
  }

  /**
   * Operator Endpoint: Pre-authorize a specific device with a single-use enrollment code.
   */
  @Post('pre-authorize')
  @HttpCode(HttpStatus.OK)
  preAuthorizeDevice(
    @Body() dto: PreAuthorizeDeviceDto,
    @Headers('x-operator-token') operatorToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    if (!this.verifyOperatorAuth(authHeader, operatorToken)) {
      throw new UnauthorizedException('Operator credentials required to pre-authorize devices');
    }
    return this.deviceTokenService.createEnrollmentChallenge(
      dto.deviceId,
      dto.expiresInSeconds,
    );
  }

  /**
   * Operator Endpoint: Revoke an individual device ID.
   */
  @Post('revoke')
  @HttpCode(HttpStatus.OK)
  revokeDevice(
    @Body() dto: RevokeDeviceDto,
    @Headers('x-operator-token') operatorToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    if (!this.verifyOperatorAuth(authHeader, operatorToken)) {
      throw new UnauthorizedException('Operator credentials required to revoke devices');
    }
    this.deviceTokenService.revokeDevice(dto.deviceId, dto.reason);
    return {
      success: true,
      deviceId: dto.deviceId,
      status: 'revoked',
    };
  }

  /**
   * Operator Endpoint: Rotate secret epoch for an individual device.
   */
  @Post('rotate-secret')
  @HttpCode(HttpStatus.OK)
  rotateDeviceSecret(
    @Body() dto: PreAuthorizeDeviceDto,
    @Headers('x-operator-token') operatorToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    if (!this.verifyOperatorAuth(authHeader, operatorToken)) {
      throw new UnauthorizedException('Operator credentials required to rotate device secrets');
    }
    const epoch = this.deviceTokenService.rotateDeviceSecret(dto.deviceId);
    return {
      success: true,
      deviceId: dto.deviceId,
      newEpoch: epoch,
    };
  }
}
