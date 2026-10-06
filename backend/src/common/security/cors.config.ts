import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ForbiddenException, Logger } from '@nestjs/common';

const logger = new Logger('CorsConfig');

export function resolveAllowedOrigins(): string[] {
  const isProduction = process.env.NODE_ENV === 'production';
  const configured = process.env.CORS_ALLOWED_ORIGINS;

  if (configured && configured.trim().length > 0) {
    const origins = configured
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);

    if (isProduction && origins.includes('*')) {
      throw new Error(
        'CRITICAL SECURITY ERROR: Wildcard "*" is strictly forbidden in CORS_ALLOWED_ORIGINS under production mode.',
      );
    }
    return origins;
  }

  if (isProduction) {
    throw new Error(
      'CRITICAL CONFIGURATION ERROR: CORS_ALLOWED_ORIGINS must be explicitly configured in production mode.',
    );
  }

  // Safe development defaults
  return [
    'http://localhost:3000',
    'http://10.0.2.2:3000',
    'http://127.0.0.1:3000',
    'http://localhost:8081',
  ];
}

export function buildCorsOptions(): CorsOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  const allowedOrigins = resolveAllowedOrigins();
  const hasWildcard = !isProduction && allowedOrigins.includes('*');

  return {
    origin: (requestOrigin, callback) => {
      // 1. Requests with no origin (native Fire TV app, Android OS, curl, backend services) are allowed
      if (!requestOrigin) {
        return callback(null, true);
      }

      // 2. Allow if origin matches configured allowlist or dev wildcard
      if (hasWildcard || allowedOrigins.includes(requestOrigin)) {
        return callback(null, true);
      }

      logger.warn(`CORS request blocked from unauthorized origin: ${requestOrigin}`);
      return callback(
        new ForbiddenException(`CORS error: Origin '${requestOrigin}' is not permitted by policy.`),
        false,
      );
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'X-FireTV-Device-Id',
      'X-Request-Id',
      'X-Api-Key',
      'X-Device-Id',
      'X-Device-Token',
      'X-Profile-Id',
      'X-Operator-Token',
      'X-Enrollment-Code',
      'X-Enrollment-Key',
      'X-Device-Secret',
      'Accept',
    ],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'Retry-After',
      'X-Request-Id',
      'X-Response-Time',
      'X-Wisp-Temporal-Floor-Ms',
    ],
    credentials: true,
    maxAge: 86400, // 24 hours preflight cache
  };
}
