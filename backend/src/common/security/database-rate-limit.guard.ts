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

    // 2. Resolve target device identifier
    let resolvedDeviceId = request.deviceId;
    if (!resolvedDeviceId && this.deviceTokenService) {
      try {
        const verified = this.deviceTokenService.extractAndVerify(request);
        if (verified?.deviceId) {
          resolvedDeviceId = verified.deviceId;
          request.deviceId = verified.deviceId;
          request.devicePayload = verified.payload;
        }
      } catch {
        // Safe to ignore authentication errors; route-level DeviceAuthGuard rejects unauthorized requests
      }
    }

    if (!resolvedDeviceId) {
      resolvedDeviceId =
        (typeof request.headers['x-firetv-device-id'] === 'string'
          ? request.headers['x-firetv-device-id'].trim()
          : undefined) ||
        (typeof request.headers['x-device-id'] === 'string'
          ? request.headers['x-device-id'].trim()
          : undefined) ||
        (typeof request.body?.deviceId === 'string'
          ? request.body.deviceId.trim()
          : undefined) ||
        'anonymous-firetv';
    }

    const windowSec = 60;
    const maxRequests = 30;

    // 3. PostgreSQL RPC execution when Supabase is configured
    if (this.supabaseService.isConfigured()) {
      try {
        const { data, error } = await this.supabaseService.executeRpc<RateLimitRpcResult>(
          'check_device_rate_limit',
          {
            p_device_id: resolvedDeviceId,
            p_window_sec: windowSec,
            p_max_requests: maxRequests,
          },
        );

        if (error || !data) {
          this.logger.warn(`Rate limit RPC check error: ${error}. Permitting request.`);
          return true;
        }

        const resetEpoch = Math.ceil(new Date(data.window_reset_at).getTime() / 1000);
        const retryAfterSec = Math.max(
          1,
          Math.ceil((new Date(data.window_reset_at).getTime() - Date.now()) / 1000),
        );

        // Emit standard rate-limit headers
        response.setHeader('X-RateLimit-Limit', data.max_requests.toString());
        response.setHeader('X-RateLimit-Remaining', data.remaining.toString());
        response.setHeader('X-RateLimit-Reset', resetEpoch.toString());

        if (!data.allowed) {
          response.setHeader('Retry-After', retryAfterSec.toString());

          this.logger.warn(
            `Device rate limit exceeded for '${data.device_id}': ${data.current_count}/${data.max_requests} (Retry-After: ${retryAfterSec}s)`,
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
        this.logger.warn(`Rate limiter fallback on error: ${err?.message}`);
        return true;
      }
    }

    // 4. In-Memory Fallback for test and unconfigured environments
    return this.handleInMemoryFallback(resolvedDeviceId, windowSec, maxRequests, response);
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
}
