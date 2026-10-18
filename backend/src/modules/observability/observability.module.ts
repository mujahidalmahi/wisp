import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { CatalogModule } from '../catalog/catalog.module';
import { ObservabilityService } from './observability.service';
import { ObservabilityController } from './observability.controller';

@Module({
  imports: [SupabaseModule, CatalogModule],
  controllers: [ObservabilityController],
  providers: [ObservabilityService],
  exports: [ObservabilityService],
})
export class ObservabilityModule {}
