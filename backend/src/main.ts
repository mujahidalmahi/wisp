import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { validateEnvironment } from './common/config/environment.validator';
import { createSecurityHeadersMiddleware } from './common/security/security-headers.config';
import { buildCorsOptions } from './common/security/cors.config';

export { validateEnvironment };

async function bootstrap() {
  validateEnvironment();

  const logger = new Logger('WispBootstrap');

  // Disable default bodyParser so strict 16 KB payload boundary is enforced
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // 1. Strict 16 KB Request Payload Protection
  app.use(json({ limit: '16kb' }));
  app.use(urlencoded({ extended: true, limit: '16kb' }));

  // 2. Strict HTTP Security Headers (Helmet, CSP, nosniff, DENY, Permissions-Policy, HSTS)
  app.use(createSecurityHeadersMiddleware());

  // 3. Global API Routing Prefix
  app.setGlobalPrefix('api/v1');

  // 4. Strict CORS Allowlisting (No Wildcard in Production)
  app.enableCors(buildCorsOptions());

  // 5. Global Validation Pipe with strict parameter whitelisting
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`Wisp API & AI Gateway listening on http://0.0.0.0:${port}/api/v1`);
}

// Only invoke bootstrap() when executed as direct entry point, never when imported by tests
const isMainScript =
  typeof process.argv[1] === 'string' &&
  (process.argv[1].replace(/\\/g, '/').endsWith('/main.js') ||
    process.argv[1].replace(/\\/g, '/').endsWith('/main.ts'));

if (isMainScript) {
  bootstrap();
}
