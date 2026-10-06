import helmet from 'helmet';
import { RequestHandler } from 'express';

export function createSecurityHeadersMiddleware(): RequestHandler {
  const isProduction = process.env.NODE_ENV === 'production';

  const helmetMiddleware = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    frameguard: {
      action: 'deny',
    },
    referrerPolicy: {
      policy: 'no-referrer',
    },
    hsts: isProduction
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
    hidePoweredBy: true,
    noSniff: true,
  });

  return (req, res, next) => {
    helmetMiddleware(req, res, () => {
      // Permissions-Policy header configuration for 10-foot TV / API security
      res.setHeader(
        'Permissions-Policy',
        'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
      );
      // Explicitly remove X-Powered-By if present
      res.removeHeader('X-Powered-By');
      next();
    });
  };
}
