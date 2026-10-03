import {
  Controller,
  Get,
  Headers,
  HttpStatus,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import * as crypto from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('health')
export class HealthController {
  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Minimal public liveness probe
   */
  @Get()
  getLiveness() {
    return {
      status: 'ok',
      service: 'wisp-backend',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness probe checking service operational state.
   * Public / anonymous response: returns safe high-level status without leaking internal database metrics or error traces.
   * Internal / operator response: returns full diagnostic telemetry when authorized via X-Operator-Token or Bearer token header.
   * Credentials in query parameters are strictly forbidden. Default fallback tokens are prohibited.
   */
  @Get('readiness')
  async getReadiness(
    @Res({ passthrough: true }) res: Response,
    @Headers('x-operator-token') operatorToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const dbHealth = await this.supabaseService.checkHealth();
    const isProduction = process.env.NODE_ENV === 'production';
    const isReady =
      dbHealth.status === 'ok' || (!isProduction && dbHealth.status === 'unconfigured');

    if (!isReady) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    const providedToken =
      (typeof operatorToken === 'string' && operatorToken.trim().length > 0
        ? operatorToken.trim()
        : undefined) ||
      (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : undefined);

    // If caller explicitly requests operator telemetry with an authorization header
    if (providedToken) {
      const expectedToken =
        process.env.INTERNAL_OPERATOR_TOKEN || process.env.OPERATOR_TOKEN;

      // Fail closed: if operator token is not configured on the server, deny access
      if (!expectedToken || expectedToken.trim().length === 0) {
        throw new ServiceUnavailableException('Operator diagnostics unavailable');
      }

      const cleanExpected = expectedToken.trim();
      const providedBuf = Buffer.from(providedToken);
      const expectedBuf = Buffer.from(cleanExpected);

      const isMatch =
        providedBuf.length === expectedBuf.length &&
        crypto.timingSafeEqual(providedBuf, expectedBuf);

      if (!isMatch) {
        throw new UnauthorizedException('Invalid operator credentials');
      }

      // Validated operator receives full diagnostic metrics
      return {
        status: isReady ? 'ok' : 'unhealthy',
        service: 'wisp-backend',
        timestamp: new Date().toISOString(),
        database: dbHealth,
      };
    }

    // Public / anonymous callers receive sanitized status without leaking latency or error strings
    return {
      status: isReady ? 'ok' : 'unhealthy',
      service: 'wisp-backend',
      timestamp: new Date().toISOString(),
      database: isReady ? 'connected' : 'unavailable',
    };
  }
}
