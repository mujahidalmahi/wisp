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
   * - Public / anonymous path: Returns lightweight status based on configuration without executing database roundtrips.
   * - Internal / operator path: Authenticates credentials BEFORE running active database health check to prevent DB exhaustion.
   */
  @Get('readiness')
  async getReadiness(
    @Res({ passthrough: true }) res: Response,
    @Headers('x-operator-token') operatorToken?: string,
    @Headers('authorization') authHeader?: string,
  ) {
    const isProduction = process.env.NODE_ENV === 'production';
    const isConfigured = this.supabaseService.isConfigured();

    const providedToken =
      (typeof operatorToken === 'string' && operatorToken.trim().length > 0
        ? operatorToken.trim()
        : undefined) ||
      (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : undefined);

    // 1. Protected Operator Diagnostic Path: Authenticate BEFORE performing database work
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

      // Validated operator receives full diagnostic metrics after health probe
      const dbHealth = await this.supabaseService.checkHealth();
      const isReady =
        dbHealth.status === 'ok' || (!isProduction && dbHealth.status === 'unconfigured');

      if (!isReady) {
        res.status(HttpStatus.SERVICE_UNAVAILABLE);
      }

      return {
        status: isReady ? 'ok' : 'unhealthy',
        service: 'wisp-backend',
        timestamp: new Date().toISOString(),
        database: dbHealth,
      };
    }

    // 2. Public / Anonymous Path:
    // Does NOT perform active database work per request to prevent Denial-of-Service.
    const isReady = isConfigured || !isProduction;
    if (!isReady) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    return {
      status: isReady ? 'ok' : 'unhealthy',
      service: 'wisp-backend',
      timestamp: new Date().toISOString(),
      database: isReady ? 'connected' : 'unavailable',
    };
  }
}
