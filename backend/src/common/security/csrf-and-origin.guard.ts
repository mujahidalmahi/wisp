import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { CsrfService } from './csrf.service';
import { resolveAllowedOrigins } from './cors.config';
import { DeviceTokenService } from '../auth/device-token.service';

@Injectable()
export class CsrfAndOriginGuard implements CanActivate {
  private readonly logger = new Logger(CsrfAndOriginGuard.name);
  private readonly csrfService: CsrfService;
  private readonly deviceTokenService: DeviceTokenService;

  private readonly publicBootstrapRoutes = new Set([
    '/auth/enroll',
    '/auth/device-token',
    '/api/v1/auth/enroll',
    '/api/v1/auth/device-token',
  ]);

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

    const rawPath = request.path || request.url || '';
    const normalizedPath =
      '/' + rawPath.split('?')[0].replace(/^\/+|\/+$/g, '').toLowerCase();

    // 2. Browser / Web Request Integrity Validation
    const secFetchSite = request.headers['sec-fetch-site'];
    const originHeader = request.headers['origin'];
    const refererHeader = request.headers['referer'];
    const csrfToken =
      request.headers['x-csrf-token'] || request.headers['x-xsrf-token'];

    // Reject cross-site state-changing browser requests immediately
    if (secFetchSite === 'cross-site') {
      this.logger.warn(`Rejected cross-site state-changing request from ${this.extractClientIp(request)}`);
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

      // Browser state-changing requests MUST present a valid HMAC-SHA256 CSRF token bound to client identity
      if (!csrfToken || typeof csrfToken !== 'string') {
        throw new ForbiddenException('Missing CSRF token for state-changing browser request.');
      }

      const clientIdentifier = this.extractClientIp(request);
      if (!this.csrfService.verifyToken(csrfToken, clientIdentifier)) {
        throw new ForbiddenException('Invalid or expired CSRF token.');
      }

      return true;
    }

    // 3. Operator Token Authentication
    // If x-operator-token is presented, it MUST be cryptographically verified; never fail-open or bypass unverified
    const rawOperatorHeader = request.headers['x-operator-token'];
    if (
      rawOperatorHeader !== undefined &&
      rawOperatorHeader !== null &&
      rawOperatorHeader !== ''
    ) {
      if (!this.verifyOperatorAuth(request)) {
        this.logger.warn(
          `Rejected invalid or unconfigured operator token from ${this.extractClientIp(request)}`,
        );
        throw new UnauthorizedException('Invalid operator credentials.');
      }
      return true;
    }

    // 4. Fire TV / Native Device Client Validation (Non-browser path)
    const fireTvDeviceId = request.headers['x-firetv-device-id'];
    const standardDeviceId = request.headers['x-device-id'];
    const wispDeviceId = request.headers['x-wisp-device-id'];
    const effectiveDeviceId = (fireTvDeviceId || standardDeviceId || wispDeviceId) as string | undefined;

    // Check device ID format if provided
    if (effectiveDeviceId) {
      if (typeof effectiveDeviceId !== 'string' || effectiveDeviceId.trim().length < 3) {
        throw new ForbiddenException('X-FireTV-Device-Id must be a valid identifier with at least 3 characters.');
      }
    }

    // If request already has an authenticated device (e.g. from upstream guard), verify header consistency
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
        if (this.verifyOperatorAuth(request)) {
          return true;
        }
        throw new UnauthorizedException('Invalid device credentials for state-changing request.');
      }
    }

    // 5. Strictly allow exact public bootstrap endpoints needed for device enrollment and token acquisition
    if (this.publicBootstrapRoutes.has(normalizedPath)) {
      return true;
    }

    // Reject unauthenticated state-changing requests that provide neither CSRF token nor valid credentials
    throw new UnauthorizedException(
      'State-changing request requires valid device authentication or browser CSRF integrity token.',
    );
  }

  private verifyOperatorAuth(request: any): boolean {
    const expected =
      process.env.INTERNAL_OPERATOR_TOKEN || process.env.OPERATOR_TOKEN;
    if (!expected || expected.trim().length === 0) {
      return false;
    }

    const operatorTokenHeader = request.headers?.['x-operator-token'];
    const authHeader = request.headers?.['authorization'];
    const candidate =
      (typeof operatorTokenHeader === 'string' && operatorTokenHeader.trim().length > 0
        ? operatorTokenHeader.trim()
        : undefined) ||
      (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : undefined);

    if (!candidate) {
      return false;
    }

    const candBuf = Buffer.from(candidate);
    const expBuf = Buffer.from(expected.trim());
    if (candBuf.length !== expBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(candBuf, expBuf);
  }

  private extractClientIp(request: any): string {
    if (typeof request?.ip === 'string' && request.ip.trim().length > 0) {
      return request.ip.trim();
    }
    const cfIp = request?.headers?.['cf-connecting-ip'];
    if (typeof cfIp === 'string' && cfIp.trim().length > 0) {
      return cfIp.trim();
    }
    const rawForwarded = request?.headers?.['x-forwarded-for'];
    if (typeof rawForwarded === 'string' && rawForwarded.length > 0) {
      const first = rawForwarded.split(',')[0].trim();
      if (first) return first;
    }
    return request?.socket?.remoteAddress || '127.0.0.1';
  }
}
