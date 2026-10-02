import { Controller, Get } from '@nestjs/common';
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
   * Diagnostic readiness probe checking database health and latency metrics
   */
  @Get('readiness')
  async getReadiness() {
    const dbHealth = await this.supabaseService.checkHealth();
    return {
      status: dbHealth.status === 'error' ? 'degraded' : 'ok',
      service: 'wisp-backend',
      timestamp: new Date().toISOString(),
      database: dbHealth,
    };
  }
}
