import {
  Injectable,
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
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { correlationId?: string; startTimeHr?: bigint }>();
    const res = http.getResponse<Response>();

    const correlationId =
      (req.headers['x-request-id'] as string) ||
      (req.headers['x-correlation-id'] as string) ||
      randomUUID();

    const startTimeHr = process.hrtime.bigint();
    req.correlationId = correlationId;
    req.startTimeHr = startTimeHr;

    res.setHeader('X-Request-Id', correlationId);

    return next.handle().pipe(
      tap(() => {
        const elapsedNs = process.hrtime.bigint() - startTimeHr;
        const elapsedMs = Number(elapsedNs) / 1_000_000;
        res.setHeader('X-Response-Time', `${elapsedMs.toFixed(2)}ms`);
      }),
    );
  }
}
