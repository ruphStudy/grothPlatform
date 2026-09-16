import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { redactSecrets } from '../hardening/redaction.util';

@Injectable()
export class ErrorMonitoringService {
  private readonly logger = new Logger(ErrorMonitoringService.name);

  constructor(private readonly config: ConfigService) {}

  captureException(error: unknown, context: Record<string, unknown> = {}) {
    if (this.config.get<string>('ERROR_MONITORING_ENABLED') !== 'true') {
      this.logger.error((error as Error)?.message || 'Unhandled error', JSON.stringify(redactSecrets(context)));
      return;
    }
    this.logger.error('captured_exception', JSON.stringify(redactSecrets({ message: (error as Error)?.message, ...context })));
  }

  captureMessage(message: string, context: Record<string, unknown> = {}) {
    this.logger.warn(message, JSON.stringify(redactSecrets(context)));
  }
}
