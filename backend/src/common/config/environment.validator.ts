/**
 * Validates operational environment constraints to prevent dangerous misconfigurations.
 * Specifically guarantees that demo fallback fixtures are never enabled under production,
 * and ensures cryptographic secrets meet minimum entropy standards.
 */
export function validateEnvironment(): void {
  if (process.env.NODE_ENV === 'production') {
    if (process.env.ENABLE_DEMO_FALLBACK === 'true') {
      throw new Error(
        'Fatal configuration error: ENABLE_DEMO_FALLBACK cannot be enabled in a production environment (NODE_ENV=production).',
      );
    }
    if (process.env.CORS_ALLOWED_ORIGINS) {
      const origins = process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim());
      if (origins.includes('*')) {
        throw new Error(
          'Fatal configuration error: CORS_ALLOWED_ORIGINS cannot contain wildcard "*" in a production environment.',
        );
      }
    }

    const deviceSecret = process.env.DEVICE_AUTH_SECRET || process.env.JWT_SECRET;
    if (!deviceSecret || deviceSecret.trim().length < 32) {
      throw new Error(
        'Fatal configuration error: DEVICE_AUTH_SECRET (or JWT_SECRET) must be set with at least 32 characters in production.',
      );
    }

    const operatorToken = process.env.INTERNAL_OPERATOR_TOKEN || process.env.OPERATOR_TOKEN;
    if (operatorToken && operatorToken.trim().length < 32) {
      throw new Error(
        'Fatal configuration error: INTERNAL_OPERATOR_TOKEN must be at least 32 characters in production.',
      );
    }

    const enrollmentSecret = process.env.DEVICE_ENROLLMENT_SECRET;
    if (enrollmentSecret && enrollmentSecret.trim().length < 32) {
      throw new Error(
        'Fatal configuration error: DEVICE_ENROLLMENT_SECRET must be at least 32 characters in production.',
      );
    }
  }
}

