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

    const deviceId = (req.headers['x-wisp-device-id'] as string) || (req.headers['x-device-id'] as string) || '-';

    return next.handle().pipe(
      tap(() => {
        const elapsedNs = process.hrtime.bigint() - startTimeHr;
        const elapsedMs = Number(elapsedNs) / 1_000_000;
        res.setHeader('X-Response-Time', `${elapsedMs.toFixed(2)}ms`);

        this.logger.log(
          `${req.method} ${req.url} ${res.statusCode} ${elapsedMs.toFixed(1)}ms [${correlationId}] device=${deviceId}`,
        );
      }),
    );
  }
}
