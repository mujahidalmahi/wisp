import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { correlationId?: string; startTimeHr?: bigint }>();

    const correlationId =
      request.correlationId ||
      (request.headers['x-request-id'] as string) ||
      'unknown-request-id';

    let elapsedMs = 0;
    if (request.startTimeHr) {
      const elapsedNs = process.hrtime.bigint() - request.startTimeHr;
      elapsedMs = Math.round((Number(elapsedNs) / 1_000_000) * 100) / 100;
    }

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let errorName = 'InternalServerError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
        errorName = exception.name;
      } else if (typeof res === 'object' && res !== null) {
        const obj = res as Record<string, any>;
        message = obj.message || exception.message;
        errorName = obj.error || exception.name;
      }
    } else if (exception instanceof Error) {
      // Map PostgREST / Postgres errors to proper HTTP codes if they escape
      const err = exception as any;
      if (err.code === '23505') {
        status = HttpStatus.CONFLICT;
        errorName = 'ConflictException';
        message = 'A record with this unique identifier already exists.';
      } else if (err.code === '23503') {
        status = HttpStatus.BAD_REQUEST;
        errorName = 'BadRequestException';
        message = 'Foreign key reference violation.';
      } else if (err.code === '22P02') {
        status = HttpStatus.BAD_REQUEST;
        errorName = 'BadRequestException';
        message = 'Invalid identifier or syntax provided in query parameters.';
      } else if (err.code === 'PGRST116' || err.code === 'P0002') {
        status = HttpStatus.NOT_FOUND;
        errorName = 'NotFoundException';
        message = 'Resource not found.';
      } else if (err.code === '23514') {
        status = HttpStatus.BAD_REQUEST;
        errorName = 'BadRequestException';
        message = err.message || 'Check constraint violation.';
      } else if (err.code === '42501') {
        status = HttpStatus.FORBIDDEN;
        errorName = 'ForbiddenException';
        message = err.message || 'Access denied for requested resource.';
      } else if (
        err.code === '08006' ||
        err.code === '08001' ||
        err.code === '57P01' ||
        err.code === '53300' ||
        err.code === 'ECONNREFUSED' ||
        err.code === 'ECONNRESET' ||
        err.message?.includes('fetch failed')
      ) {
        status = HttpStatus.SERVICE_UNAVAILABLE;
        errorName = 'ServiceUnavailableException';
        message = 'Database service temporarily unavailable.';
      } else {
        this.logger.error(
          `[${correlationId}] Unhandled System Error: ${exception.message}`,
          exception.stack,
        );
        message = 'An unexpected internal error occurred.';
        errorName = 'InternalServerError';
      }
    } else {
      this.logger.error(`[${correlationId}] Non-error thrown: ${String(exception)}`);
    }

    response.setHeader('X-Request-Id', correlationId);
    response.setHeader('X-Response-Time', `${elapsedMs}ms`);

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      correlationId,
      error: errorName,
      message,
    });
  }
}
