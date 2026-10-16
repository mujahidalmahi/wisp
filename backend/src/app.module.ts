import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { HealthModule } from './modules/health/health.module';
import { SupabaseModule } from './modules/supabase/supabase.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { ContextModule } from './modules/context/context.module';
import { AiGatewayModule } from './modules/ai-gateway/ai-gateway.module';
import { AuthModule } from './modules/auth/auth.module';
import { SecurityModule } from './modules/security/security.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { RequestCorrelationInterceptor } from './common/interceptors/correlation.interceptor';
import { CsrfAndOriginGuard } from './common/security/csrf-and-origin.guard';
import { DatabaseRateLimitGuard } from './common/security/database-rate-limit.guard';
import { HppMiddleware } from './common/security/hpp.middleware';
import { InputSanitizationMiddleware } from './common/security/input-sanitizer';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 45,
      },
    ]),
    AuthModule,
    SupabaseModule,
    SecurityModule,
    SessionsModule,
    HealthModule,
    CatalogModule,
    ProfilesModule,
    ContextModule,
    AiGatewayModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalHttpExceptionFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestCorrelationInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfAndOriginGuard,
    },
    {
      provide: APP_GUARD,
      useClass: DatabaseRateLimitGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(HppMiddleware, InputSanitizationMiddleware)
      .forRoutes('*');
  }
}
