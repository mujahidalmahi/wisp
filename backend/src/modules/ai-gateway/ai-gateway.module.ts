import { Module } from '@nestjs/common';
import { ContextModule } from '../context/context.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { AiGatewayController } from './ai-gateway.controller';
import { AiGatewayService } from './ai-gateway.service';

@Module({
  imports: [ContextModule, SupabaseModule],
  controllers: [AiGatewayController],
  providers: [AiGatewayService],
  exports: [AiGatewayService],
})
export class AiGatewayModule {}
