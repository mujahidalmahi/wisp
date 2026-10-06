import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [SupabaseModule, CatalogModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
