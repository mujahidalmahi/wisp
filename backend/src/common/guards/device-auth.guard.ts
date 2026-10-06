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

    // 2. Reject any attempt to spoof or mismatch device claims in query, body, or params
    const checkMismatch = (val: unknown, location: string) => {
      if (val === undefined || val === null) return;
      if (Array.isArray(val)) {
        for (const item of val) {
          if (typeof item !== 'string' || (item.trim().length > 0 && item.trim() !== authenticatedDeviceId)) {
            const displayVal = typeof item === 'string' ? `'${item.trim()}' ` : '';
            throw new ForbiddenException(
              `Device mismatch: ${location} deviceId ${displayVal}does not match authenticated device '${authenticatedDeviceId}'`,
            );
          }
        }
      } else if (typeof val !== 'string' || (val.trim().length > 0 && val.trim() !== authenticatedDeviceId)) {
        const displayVal = typeof val === 'string' ? `'${val.trim()}' ` : '';
        throw new ForbiddenException(
          `Device mismatch: ${location} deviceId ${displayVal}does not match authenticated device '${authenticatedDeviceId}'`,
        );
      }
    };

    checkMismatch(request.headers?.['x-device-id'], 'header x-device-id');
    checkMismatch(request.headers?.['x-firetv-device-id'], 'header x-firetv-device-id');
    checkMismatch(request.query?.deviceId, 'query');
    checkMismatch(request.body?.deviceId, 'payload');
    checkMismatch(request.params?.deviceId, 'param');

    // Attach verified identity to request
    request.deviceId = authenticatedDeviceId;
    request.devicePayload = verified.payload;
    return true;
  }
}
