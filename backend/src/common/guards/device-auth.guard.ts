import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class DeviceAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const rawHeaderDeviceId =
      request.headers['x-device-id'] ||
      (typeof request.headers['authorization'] === 'string' &&
      request.headers['authorization'].startsWith('Device ')
        ? request.headers['authorization'].replace('Device ', '').trim()
        : undefined);

    const headerDeviceId =
      typeof rawHeaderDeviceId === 'string' ? rawHeaderDeviceId.trim() : undefined;
    const bodyDeviceId =
      request.body && typeof request.body.deviceId === 'string'
        ? request.body.deviceId.trim()
        : undefined;
    const queryDeviceId =
      request.query && typeof request.query.deviceId === 'string'
        ? request.query.deviceId.trim()
        : undefined;

    // Use header deviceId as primary authenticated identity
    let authenticatedDeviceId = headerDeviceId;

    // In local / development / test mode, allow query or body fallback if header not sent
    if (!authenticatedDeviceId) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException(
          'Missing device authentication: X-Device-Id header is required',
        );
      }
      authenticatedDeviceId = bodyDeviceId || queryDeviceId;
    }

    if (!authenticatedDeviceId) {
      throw new UnauthorizedException(
        'Device identification required via X-Device-Id header or deviceId parameter',
      );
    }

    // Verify claim alignment: If body or query explicitly provides a deviceId, it must match
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

    request.deviceId = authenticatedDeviceId;
    return true;
  }
}
