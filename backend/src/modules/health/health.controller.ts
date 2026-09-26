import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'wisp-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
