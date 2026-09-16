import type { NextFunction, Request, Response } from 'express';

type Policy = { windowMs: number; max: number };
const buckets = new Map<string, { count: number; resetAt: number }>();

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const policies: Record<string, Policy> = {
  auth: { windowMs: numberEnv('RATE_LIMIT_AUTH_WINDOW_MS', 60_000), max: numberEnv('RATE_LIMIT_AUTH_MAX', 20) },
  public: { windowMs: numberEnv('RATE_LIMIT_PUBLIC_WINDOW_MS', 60_000), max: numberEnv('RATE_LIMIT_PUBLIC_MAX', 120) },
  api: { windowMs: numberEnv('RATE_LIMIT_API_WINDOW_MS', 60_000), max: numberEnv('RATE_LIMIT_API_MAX', 300) },
  ai: { windowMs: numberEnv('RATE_LIMIT_AI_WINDOW_MS', 60_000), max: numberEnv('RATE_LIMIT_AI_MAX', 30) },
  webhook: { windowMs: numberEnv('RATE_LIMIT_WEBHOOK_WINDOW_MS', 60_000), max: numberEnv('RATE_LIMIT_WEBHOOK_MAX', 240) },
  analytics: { windowMs: numberEnv('RATE_LIMIT_ANALYTICS_WINDOW_MS', 60_000), max: numberEnv('RATE_LIMIT_ANALYTICS_MAX', 2000) },
};

function policyFor(path: string) {
  if (/\/api\/v1\/auth\/(login|register|refresh|logout)/.test(path) || /\/api\/v1\/invitations\/accept/.test(path)) return 'auth';
  if (/\/api\/v1\/webhooks\//.test(path)) return 'webhook';
  if (/\/api\/v1\/analytics\/collect|\/api\/v1\/events/.test(path)) return 'analytics';
  if (/generate|improve|growth-brain|intelligence/.test(path)) return 'ai';
  if (/\/api\/v1\/forms\//.test(path)) return 'public';
  return 'api';
}

function clientKey(req: Request & { user?: { userId?: string } }, scope: string) {
  const user = req.user?.userId;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `${scope}:${user || ip}`;
}

export function rateLimitMiddleware(req: Request & { user?: { userId?: string } }, res: Response, next: NextFunction) {
  const scope = policyFor(req.originalUrl || req.url);
  const policy = policies[scope];
  const key = clientKey(req, scope);
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + policy.windowMs });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > policy.max) {
    const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({ code: 'rate_limit_exceeded', message: 'Too many requests. Please try again shortly.', retryAfterSeconds });
  }
  return next();
}
