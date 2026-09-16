import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/hardening/http-exception.filter';
import { rateLimitMiddleware } from './common/hardening/rate-limit.middleware';
import { requestContextMiddleware } from './common/hardening/request-context.middleware';
import { requestLoggingMiddleware } from './common/hardening/request-logging.middleware';
import { securityHeadersMiddleware } from './common/hardening/security-headers.middleware';
import { validateProductionEnv } from './common/hardening/env-validation';
import { ErrorMonitoringService } from './common/monitoring/error-monitoring.service';

async function bootstrap() {
  validateProductionEnv();
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.getHttpAdapter().getInstance().set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
  app.use(json({ limit: process.env.API_BODY_LIMIT || '1mb' }));
  app.use(urlencoded({ extended: false, limit: process.env.API_BODY_LIMIT || '1mb' }));
  app.use(requestContextMiddleware);
  app.use(requestLoggingMiddleware);
  app.use(securityHeadersMiddleware);
  app.use(rateLimitMiddleware);
  const configuredOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const devOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5175',
    'http://127.0.0.1:5175',
    'http://localhost:5176',
    'http://127.0.0.1:5176',
  ];
  const allowedOrigins = configuredOrigins.length > 0 ? configuredOrigins : devOrigins;
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    credentials: false,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new GlobalHttpExceptionFilter(app.get(ErrorMonitoringService)));
  app.enableShutdownHooks();
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', message: 'gip_backend_starting', environment: process.env.NODE_ENV || 'development', version: process.env.APP_VERSION || process.env.GIT_SHA || 'local' }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
