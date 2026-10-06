import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { CsrfService } from './csrf.service';
import { resolveAllowedOrigins } from './cors.config';
import { DeviceTokenService } from '../auth/device-token.service';

@Injectable()
export class CsrfAndOriginGuard implements CanActivate {
  private readonly logger = new Logger(CsrfAndOriginGuard.name);
  private readonly csrfService: CsrfService;
  private readonly deviceTokenService: DeviceTokenService;

  constructor(
    csrfService?: CsrfService,
    deviceTokenService?: DeviceTokenService,
  ) {
    this.csrfService = csrfService || new CsrfService();
    this.deviceTokenService = deviceTokenService || new DeviceTokenService();
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const method = (request.method || 'GET').toUpperCase();

    // 1. Safe methods are idempotent and exempt from CSRF / Origin state-changing guards
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true;
    }

    const path = request.path || request.url || '';

    // 2. Browser / Web Request Integrity Validation
    const secFetchSite = request.headers['sec-fetch-site'];
    const originHeader = request.headers['origin'];
    const refererHeader = request.headers['referer'];
    const csrfToken =
      request.headers['x-csrf-token'] || request.headers['x-xsrf-token'];

    // Reject cross-site state-changing browser requests immediately
    if (secFetchSite === 'cross-site') {
      this.logger.warn(`Rejected cross-site state-changing request from ${request.ip}`);
      throw new ForbiddenException('Cross-site state-changing requests are strictly forbidden.');
    }

    const isBrowserRequest = !!(originHeader || refererHeader || secFetchSite);

    if (isBrowserRequest) {
      const allowedOrigins = resolveAllowedOrigins();
      const isProduction = process.env.NODE_ENV === 'production';
      const allowWildcard = !isProduction && allowedOrigins.includes('*');

      // Verify Origin header if present
      if (originHeader) {
        const cleanOrigin = originHeader.trim();
        if (!allowWildcard && !allowedOrigins.includes(cleanOrigin)) {
          this.logger.warn(`Rejected state-changing request with unauthorized Origin: ${cleanOrigin}`);
          throw new ForbiddenException(`Origin '${cleanOrigin}' is not permitted by integrity policy.`);
        }
      } else if (refererHeader) {
        // Fallback to Referer header parsing
        try {
          const parsedReferer = new URL(refererHeader);
          const refererOrigin = parsedReferer.origin;
          if (!allowWildcard && !allowedOrigins.includes(refererOrigin)) {
            this.logger.warn(`Rejected state-changing request with unauthorized Referer: ${refererOrigin}`);
            throw new ForbiddenException(`Referer origin '${refererOrigin}' is not permitted.`);
          }
        } catch {
          throw new ForbiddenException('Malformed Referer header.');
        }
      }

      // Browser state-changing requests MUST present a valid HMAC-SHA256 CSRF token
      if (!csrfToken || typeof csrfToken !== 'string') {
        throw new ForbiddenException('Missing CSRF token for state-changing browser request.');
      }

      if (!this.csrfService.verifyToken(csrfToken)) {
        throw new ForbiddenException('Invalid or expired CSRF token.');
      }

      return true;
    }

    // 3. Fire TV / Native Device Client Validation (Non-browser path)
    const fireTvDeviceId = request.headers['x-firetv-device-id'];
    const standardDeviceId = request.headers['x-device-id'];
    const effectiveDeviceId = (fireTvDeviceId || standardDeviceId) as string | undefined;

    // Check device ID format if provided
    if (effectiveDeviceId) {
      if (typeof effectiveDeviceId !== 'string' || effectiveDeviceId.trim().length < 3) {
        throw new ForbiddenException('X-FireTV-Device-Id must be a valid identifier with at least 3 characters.');
      }
    }

    // If request already has an authenticated device (e.g. from DeviceAuthGuard), verify header consistency
    if (request.deviceId) {
      if (effectiveDeviceId && effectiveDeviceId.trim() !== request.deviceId) {
        throw new ForbiddenException(
          `Device mismatch: X-FireTV-Device-Id '${effectiveDeviceId.trim()}' does not match authenticated device '${request.deviceId}'`,
        );
      }
      return true;
    }

    // If Authorization or X-Device-Token header is provided on the request, verify device identity
    const hasAuth =
      request.headers['authorization'] || request.headers['x-device-token'];
    if (hasAuth) {
      try {
        const verified = this.deviceTokenService.extractAndVerify(request);
        if (effectiveDeviceId && effectiveDeviceId.trim() !== verified.deviceId) {
          throw new ForbiddenException(
            `Device mismatch: X-FireTV-Device-Id '${effectiveDeviceId.trim()}' does not match verified device token '${verified.deviceId}'`,
          );
        }
        request.deviceId = verified.deviceId;
        request.devicePayload = verified.payload;
        return true;
      } catch (err) {
        if (err instanceof ForbiddenException) throw err;
        throw new UnauthorizedException('Invalid device credentials for state-changing request.');
      }
    }

    // Exempt dedicated device enrollment, token exchange, and operator management endpoints
    // AuthController performs its own strict authentication (challenges, device secrets, operator tokens)
    if (
      path.includes('/auth/') ||
      Boolean(request.headers['x-operator-token'])
    ) {
      return true;
    }

    // Reject unauthenticated state-changing requests that provide neither CSRF token nor device credentials
    throw new UnauthorizedException(
      'State-changing request requires valid device authentication or browser CSRF integrity token.',
    );
  }
}
