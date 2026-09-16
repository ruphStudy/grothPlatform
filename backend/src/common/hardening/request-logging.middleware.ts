import type { NextFunction, Request, Response } from 'express';

export function requestLoggingMiddleware(req: Request & { requestId?: string; startedAt?: number; user?: { userId?: string } }, res: Response, next: NextFunction) {
  res.on('finish', () => {
    const durationMs = Date.now() - (req.startedAt || Date.now());
    const log = {
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      requestId: req.requestId,
      method: req.method,
      route: req.originalUrl?.split('?')[0],
      status: res.statusCode,
      durationMs,
      userId: req.user?.userId,
    };
    const line = JSON.stringify(log);
    if (res.statusCode >= 500) console.error(line);
    else if (res.statusCode >= 400 || durationMs > Number(process.env.SLOW_REQUEST_MS || 2000)) console.warn(line);
    else if (process.env.NODE_ENV === 'production') console.log(line);
  });
  next();
}
