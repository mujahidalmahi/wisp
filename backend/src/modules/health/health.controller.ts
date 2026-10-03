import { Controller, Get, Headers, HttpStatus, Query, Res } from '@nestjs/common';
import { Response } from 'express';
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
   * Internal / operator response: returns full diagnostic telemetry when authorized via X-Operator-Token or Bearer token.
   */
  @Get('readiness')
  async getReadiness(
    @Res({ passthrough: true }) res: Response,
    @Headers('x-operator-token') operatorToken?: string,
    @Headers('authorization') authHeader?: string,
    @Query('token') queryToken?: string,
  ) {
    const dbHealth = await this.supabaseService.checkHealth();
    const isProduction = process.env.NODE_ENV === 'production';
    const isReady =
      dbHealth.status === 'ok' || (!isProduction && dbHealth.status === 'unconfigured');

    if (!isReady) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
    }

    // Verify operator / internal authorization
    const expectedToken =
      process.env.INTERNAL_OPERATOR_TOKEN ||
      process.env.OPERATOR_TOKEN ||
      'wisp-internal-operator-key';

    const providedToken =
      operatorToken ||
      queryToken ||
      (authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined);

    const isOperator = !!providedToken && providedToken === expectedToken;

    // Operator / internal callers receive full diagnostic metrics
    if (isOperator) {
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
