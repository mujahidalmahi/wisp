import { Module } from '@nestjs/common';
import { SecurityController } from './security.controller';
import { CsrfService } from '../../common/security/csrf.service';
import { CsrfAndOriginGuard } from '../../common/security/csrf-and-origin.guard';
import { DatabaseRateLimitGuard } from '../../common/security/database-rate-limit.guard';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [SupabaseModule, AuthModule],
  controllers: [SecurityController],
  providers: [CsrfService, CsrfAndOriginGuard, DatabaseRateLimitGuard],
  exports: [CsrfService, CsrfAndOriginGuard, DatabaseRateLimitGuard],
})
export class SecurityModule {}
