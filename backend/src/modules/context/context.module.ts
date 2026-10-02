import { Module } from '@nestjs/common';
import { ContextService } from './context.service';
import { ContextController } from './context.controller';
import { SupabaseModule } from '../supabase/supabase.module';
import { CatalogModule } from '../catalog/catalog.module';
import { ProfilesModule } from '../profiles/profiles.module';

@Module({
  imports: [SupabaseModule, CatalogModule, ProfilesModule],
  controllers: [ContextController],
  providers: [ContextService],
  exports: [ContextService],
})
export class ContextModule {}
