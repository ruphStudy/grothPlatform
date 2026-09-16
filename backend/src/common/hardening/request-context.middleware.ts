import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestContextMiddleware(req: Request & { requestId?: string; startedAt?: number }, res: Response, next: NextFunction) {
  const incoming = req.header('x-request-id');
  const requestId = incoming && incoming.length <= 100 ? incoming : randomUUID();
  req.requestId = requestId;
  req.startedAt = Date.now();
  res.setHeader('X-Request-Id', requestId);
  next();
}
