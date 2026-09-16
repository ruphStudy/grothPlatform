import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorMonitoringService } from '../monitoring/error-monitoring.service';

function safeCode(status: number, response: unknown) {
  if (response && typeof response === 'object') {
    const body = response as Record<string, unknown>;
    if (typeof body.errorCode === 'string') return body.errorCode;
    if (typeof body.code === 'string') return body.code;
    if (typeof body.error === 'string') return body.error.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  }
  if (status === 404) return 'not_found';
  if (status === 403) return 'forbidden';
  if (status === 401) return 'unauthorized';
  if (status === 400) return 'bad_request';
  if (status === 429) return 'rate_limit_exceeded';
  return 'internal_error';
}

function safeMessage(status: number, response: unknown) {
  if (status >= 500) return 'Something went wrong.';
  if (response && typeof response === 'object') {
    const body = response as Record<string, unknown>;
    const raw = body.message;
    if (Array.isArray(raw)) return raw.join(', ');
    if (typeof raw === 'string') return raw;
  }
  if (typeof response === 'string') return response;
  return status >= 500 ? 'Something went wrong.' : 'Request failed.';
}

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly monitoring: ErrorMonitoringService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { requestId?: string; user?: { userId?: string } }>();
    const res = ctx.getResponse<Response>();
    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const response = isHttp ? exception.getResponse() : undefined;
    const requestId = req.requestId;

    if (!isHttp || status >= 500) {
      this.monitoring.captureException(exception, {
        requestId,
        userId: req.user?.userId,
        route: req.originalUrl,
        method: req.method,
        status,
      });
    }

    res.status(status).json({
      code: safeCode(status, response),
      message: safeMessage(status, response),
      requestId,
    });
  }
}
