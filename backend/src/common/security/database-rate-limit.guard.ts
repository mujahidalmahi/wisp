import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { SupabaseService } from '../../modules/supabase/supabase.service';
import { DeviceTokenService } from '../auth/device-token.service';
import { extractClientIp } from './client-ip.util';

interface RateLimitRpcResult {
  allowed: boolean;
  device_id: string;
  current_count: number;
  max_requests: number;
  remaining: number;
  window_reset_at: string;
}

@Injectable()
export class DatabaseRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(DatabaseRateLimitGuard.name);

  // In-memory fallback tracker for non-database or test environments
  private readonly inMemoryWindows = new Map<
    string,
    { count: number; windowStart: number }
  >();

  constructor(
    private readonly supabaseService: SupabaseService,
    @Optional() private readonly deviceTokenService?: DeviceTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest();
    const response = httpContext.getResponse();

    const path = request.path || request.url || '';

    // 1. Exempt routes from database rate-limiting
    if (
      path.includes('/health') ||
      path.includes('/security/csrf-token') ||
      request.method === 'OPTIONS'
    ) {
      return true;
    }

    // 2. Resolve target identity securely
    // Authenticated devices MUST be verified cryptographically via deviceTokenService.
    // Unauthenticated callers are bounded by trusted client IP, never by spoofable headers.
    let authenticatedDeviceId: string | undefined = request.deviceId;
    if (!authenticatedDeviceId && this.deviceTokenService) {
      try {
        const verified = this.deviceTokenService.extractAndVerify(request);
        if (verified?.deviceId) {
          authenticatedDeviceId = verified.deviceId;
          request.deviceId = verified.deviceId;
          request.devicePayload = verified.payload;
        }
      } catch {
        // Unauthenticated or token invalid
      }
    }

    // Rate-limiting identity: authenticated deviceId or trusted client IP bucket
    const rateLimitIdentity = authenticatedDeviceId
      ? authenticatedDeviceId
      : `ip:${this.extractClientIp(request)}`;

    const windowSec = 60;
    const maxRequests = 30;

    // 3. PostgreSQL RPC execution when Supabase is configured
    if (this.supabaseService.isConfigured()) {
      try {
        const { data, error } = await this.supabaseService.executeRpc<RateLimitRpcResult>(
          'check_device_rate_limit',
          {
            p_device_id: rateLimitIdentity,
            p_window_sec: windowSec,
            p_max_requests: maxRequests,
          },
        );

        // Fail-closed in production when RPC check fails or returns no data
        if (error || !data) {
          this.logger.error(`Rate limit RPC check error: ${error || 'null response'}`);
          if (this.isProduction()) {
            throw new HttpException(
              {
                statusCode: HttpStatus.SERVICE_UNAVAILABLE,
                error: 'ServiceUnavailable',
                message: 'Rate limiting service is temporarily unavailable. Request denied for protection.',
                headline: 'Service Temporarily Unavailable',
                body: 'Wisp is currently unable to verify rate limits. Please try again in a few moments.',
              },
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }
          return this.handleInMemoryFallback(rateLimitIdentity, windowSec, maxRequests, response);
        }

        // Validate entire RPC response payload schema, ranges, and consistency (Blocker 4)
        const validated = this.validateRateLimitRpcResult(data, rateLimitIdentity, windowSec);
        if (!validated) {
          this.logger.error(`Malformed or inconsistent response from rate limit RPC: ${JSON.stringify(data)}`);
          if (this.isProduction()) {
            throw new HttpException(
              {
                statusCode: HttpStatus.SERVICE_UNAVAILABLE,
                error: 'ServiceUnavailable',
                message: 'Invalid rate limiter state received from backend verification.',
              },
              HttpStatus.SERVICE_UNAVAILABLE,
            );
          }
          return this.handleInMemoryFallback(rateLimitIdentity, windowSec, maxRequests, response);
        }

        const resetMs = new Date(validated.window_reset_at).getTime();
        const resetEpoch = Math.ceil(resetMs / 1000);
        const retryAfterSec = Math.max(1, Math.ceil((resetMs - Date.now()) / 1000));

        // Emit standard rate-limit headers
        response.setHeader('X-RateLimit-Limit', validated.max_requests.toString());
        response.setHeader('X-RateLimit-Remaining', validated.remaining.toString());
        response.setHeader('X-RateLimit-Reset', resetEpoch.toString());

        if (!validated.allowed) {
          response.setHeader('Retry-After', retryAfterSec.toString());

          this.logger.warn(
            `Rate limit exceeded for '${validated.device_id}': ${validated.current_count}/${validated.max_requests} (Retry-After: ${retryAfterSec}s)`,
          );

          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              error: 'TooManyRequests',
              message: 'Device request rate limit exceeded. Please wait before retrying.',
              retryAfter: retryAfterSec,
              headline: 'Rate Limit Exceeded',
              body: 'You have made too many requests. Please wait a moment before asking Wisp again.',
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        return true;
      } catch (err: any) {
        if (err instanceof HttpException) throw err;
        this.logger.error(`Rate limiter execution error: ${err?.message}`);
        if (this.isProduction()) {
          throw new HttpException(
            {
              statusCode: HttpStatus.SERVICE_UNAVAILABLE,
              error: 'ServiceUnavailable',
              message: 'Rate limiting service unavailable.',
            },
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
        return this.handleInMemoryFallback(rateLimitIdentity, windowSec, maxRequests, response);
      }
    }

    // 4. In production, Supabase MUST be configured for persistent rate limiting (Blocker 3)
    if (this.isProduction()) {
      this.logger.error('Database rate limiting is unconfigured in production environment.');
      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          error: 'ServiceUnavailable',
          message: 'Rate limiting service is unconfigured in production. Request denied for protection.',
          headline: 'Service Temporarily Unavailable',
          body: 'Wisp is currently unable to verify rate limits. Please try again later.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // In-Memory Fallback permitted strictly for non-production / test environments
    return this.handleInMemoryFallback(rateLimitIdentity, windowSec, maxRequests, response);
  }

  private handleInMemoryFallback(
    deviceId: string,
    windowSec: number,
    maxRequests: number,
    response: any,
  ): boolean {
    const now = Date.now();
    const windowMs = windowSec * 1000;
    const currentWindowStart = Math.floor(now / windowMs) * windowMs;

    // Prune stale windows if map grows large to prevent memory leaks
    if (this.inMemoryWindows.size > 1000) {
      for (const [key, val] of this.inMemoryWindows.entries()) {
        if (now - val.windowStart > windowMs * 2) {
          this.inMemoryWindows.delete(key);
        }
      }
    }

    let tracker = this.inMemoryWindows.get(deviceId);
    if (!tracker || tracker.windowStart !== currentWindowStart) {
      tracker = { count: 1, windowStart: currentWindowStart };
      this.inMemoryWindows.set(deviceId, tracker);
    } else {
      tracker.count++;
    }

    const resetEpoch = Math.ceil((currentWindowStart + windowMs) / 1000);
    const retryAfterSec = Math.max(1, Math.ceil((currentWindowStart + windowMs - now) / 1000));
    const remaining = Math.max(0, maxRequests - tracker.count);

    if (response && typeof response.setHeader === 'function') {
      response.setHeader('X-RateLimit-Limit', maxRequests.toString());

      response.setHeader('X-RateLimit-Remaining', remaining.toString());
      response.setHeader('X-RateLimit-Reset', resetEpoch.toString());
    }

    if (tracker.count > maxRequests) {
      if (response && typeof response.setHeader === 'function') {
        response.setHeader('Retry-After', retryAfterSec.toString());
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'TooManyRequests',
          message: 'Device request rate limit exceeded. Please wait before retrying.',
          retryAfter: retryAfterSec,
          headline: 'Rate Limit Exceeded',
          body: 'You have made too many requests. Please wait a moment before asking Wisp again.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private validateRateLimitRpcResult(
    data: any,
    expectedIdentity: string,
    windowSec: number,
  ): RateLimitRpcResult | null {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return null;
    }
    if (typeof data.allowed !== 'boolean') {
      return null;
    }
    if (typeof data.device_id !== 'string' || data.device_id.trim() !== expectedIdentity.trim()) {
      return null;
    }
    if (
      !Number.isInteger(data.current_count) ||
      data.current_count < 0 ||
      !Number.isInteger(data.max_requests) ||
      data.max_requests <= 0 ||
      !Number.isInteger(data.remaining) ||
      data.remaining < 0 ||
      data.remaining > data.max_requests
    ) {
      return null;
    }

    // Consistency check: remaining must match max - count (clamped at 0)
    const expectedRemaining = Math.max(0, data.max_requests - data.current_count);
    if (data.remaining !== expectedRemaining) {
      return null;
    }
    const expectedAllowed = data.current_count <= data.max_requests;
    if (data.allowed !== expectedAllowed) {
      return null;
    }

    // Timestamp validation: valid ISO within expected window
    if (!data.window_reset_at || typeof data.window_reset_at !== 'string') {
      return null;
    }
    const resetMs = new Date(data.window_reset_at).getTime();
    if (isNaN(resetMs)) {
      return null;
    }
    const now = Date.now();
    // Reset timestamp must be bounded: not more than 5s in past, not farther than window + 60s
    if (resetMs < now - 5000 || resetMs > now + (windowSec + 60) * 1000) {
      return null;
    }

    return data as RateLimitRpcResult;
  }

  private isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  private extractClientIp(request: any): string {
    return extractClientIp(request);
  }
}
