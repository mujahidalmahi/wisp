/**
 * Validates operational environment constraints to prevent dangerous misconfigurations.
 * Specifically guarantees that demo fallback fixtures are never enabled under production.
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
  }
}
