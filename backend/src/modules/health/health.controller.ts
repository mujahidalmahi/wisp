import { Controller, Get } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('health')
export class HealthController {
  constructor(private readonly supabaseService: SupabaseService) {}

  @Get()
  async check() {
    const dbHealth = await this.supabaseService.checkHealth();
    return {
      status: dbHealth.status === 'error' ? 'degraded' : 'ok',
      service: 'wisp-backend',
      timestamp: new Date().toISOString(),
      database: dbHealth,
    };
  }
}
