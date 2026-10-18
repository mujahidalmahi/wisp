import {
  Injectable,
  Logger,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';
import { Response, Request } from 'express';

@Injectable()
export class RequestCorrelationInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HttpRequest');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { correlationId?: string; startTimeHr?: bigint }>();
    const res = http.getResponse<Response>();

    const rawCorrelationId =
      (req.headers['x-request-id'] as string) ||
      (req.headers['x-correlation-id'] as string);

    // Sanitize correlationId: strictly alphanumeric, dash, underscore (max 64 chars) to prevent CRLF header injection
    const correlationId =
      typeof rawCorrelationId === 'string' &&
      /^[a-zA-Z0-9_\-]{1,64}$/.test(rawCorrelationId.trim())
        ? rawCorrelationId.trim()
        : randomUUID();

    const startTimeHr = process.hrtime.bigint();
    req.correlationId = correlationId;
    req.startTimeHr = startTimeHr;

    res.setHeader('X-Request-Id', correlationId);
    res.setHeader('X-Correlation-Id', correlationId);

    const rawDeviceId =
      (req as any).device?.id ||
      (req.headers['x-wisp-device-id'] as string) ||
      (req.headers['x-device-id'] as string) ||
      '-';
    const cleanDeviceId = String(rawDeviceId).replace(/[\r\n\x00-\x1F\x7F]/g, '').slice(0, 64);
    const cleanUrl = (req.originalUrl || req.url || '').replace(/[\r\n\x00-\x1F\x7F]/g, '').slice(0, 256);

    return next.handle().pipe(
      tap({
        next: () => {
          const elapsedNs = process.hrtime.bigint() - startTimeHr;
          const elapsedMs = Number(elapsedNs) / 1_000_000;
          res.setHeader('X-Response-Time', `${elapsedMs.toFixed(2)}ms`);

          this.logger.log(
            `${req.method} ${cleanUrl} ${res.statusCode} ${elapsedMs.toFixed(1)}ms [${correlationId}] device=${cleanDeviceId}`,
          );
        },
        error: (err: any) => {
          const elapsedNs = process.hrtime.bigint() - startTimeHr;
          const elapsedMs = Number(elapsedNs) / 1_000_000;
          const status = err?.status || err?.statusCode || 500;
          const cleanErrorMessage = String(err?.message || 'Internal Error').replace(/[\r\n\x00-\x1F\x7F]/g, '').slice(0, 256);

          this.logger.warn(
            `${req.method} ${cleanUrl} ${status} ${elapsedMs.toFixed(1)}ms [${correlationId}] device=${cleanDeviceId} error="${cleanErrorMessage}"`,
          );
        },
      }),
    );
  }
}
