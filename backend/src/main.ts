import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { validateEnvironment } from './common/config/environment.validator';

export { validateEnvironment };

async function bootstrap() {
  validateEnvironment();

  const logger = new Logger('WispBootstrap');
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');

  // Configurable CORS with safe defaults (Item 15)
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'http://10.0.2.2:3000', 'http://127.0.0.1:3000', 'http://localhost:8081'];

  app.enableCors({
    origin: allowedOrigins.includes('*') ? '*' : allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Device-Id',
      'X-Device-Token',
      'X-Profile-Id',
      'X-Request-Id',
      'X-Operator-Token',
      'Accept',
    ],
    credentials: true,
  });

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
