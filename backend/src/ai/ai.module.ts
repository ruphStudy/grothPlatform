import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { AiService } from './ai.service';
import { OpenAiProvider } from './providers/openai.provider';

@Module({
  imports: [BillingModule],
  providers: [AiService, OpenAiProvider],
  exports: [AiService],
})
export class AiModule {}
