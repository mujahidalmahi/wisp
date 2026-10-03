import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DeviceTokenService } from '../auth/device-token.service';

@Injectable()
export class DeviceAuthGuard implements CanActivate {
  private readonly deviceTokenService: DeviceTokenService;

  constructor(deviceTokenService?: DeviceTokenService) {
    this.deviceTokenService = deviceTokenService || new DeviceTokenService();
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // 1. Authenticate device identity strictly via verified cryptographic credential
    const verified = this.deviceTokenService.extractAndVerify(request);
    const authenticatedDeviceId = verified.deviceId;

    // 2. Reject any attempt to spoof or mismatch device claims in query or body
    const bodyDeviceId =
      request.body &&
      typeof request.body.deviceId === 'string' &&
      request.body.deviceId.trim().length > 0
        ? request.body.deviceId.trim()
        : undefined;

    const queryDeviceId =
      request.query &&
      typeof request.query.deviceId === 'string' &&
      request.query.deviceId.trim().length > 0
        ? request.query.deviceId.trim()
        : undefined;

    if (queryDeviceId && queryDeviceId !== authenticatedDeviceId) {
      throw new ForbiddenException(
        `Device mismatch: query deviceId '${queryDeviceId}' does not match authenticated device '${authenticatedDeviceId}'`,
      );
    }

    if (bodyDeviceId && bodyDeviceId !== authenticatedDeviceId) {
      throw new ForbiddenException(
        `Device mismatch: payload deviceId '${bodyDeviceId}' does not match authenticated device '${authenticatedDeviceId}'`,
      );
    }

    // Attach verified identity to request
    request.deviceId = authenticatedDeviceId;
    request.devicePayload = verified.payload;
    return true;
  }
}
