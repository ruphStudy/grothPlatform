import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiUsageService, QuotaService } from '../billing/services/billing.service';
import { AiProvider, GenerateStructuredParams } from './interfaces/ai-provider.interface';
import { OpenAiProvider } from './providers/openai.provider';

export interface AiGenerationResult<T> {
  data: T;
  provider: string;
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    providerCostMinor?: number;
    providerCostCurrency?: string;
  };
}

@Injectable()
export class AiService {
  constructor(
    private readonly configService: ConfigService,
    private readonly openAiProvider: OpenAiProvider,
    private readonly quotaService: QuotaService,
    private readonly aiUsageService: AiUsageService,
  ) {}

  private resolveProvider(): AiProvider {
    const providerName = this.configService.get<string>('AI_PROVIDER') ?? 'openai';
    if (providerName === 'openai') {
      return this.openAiProvider;
    }
    throw new ServiceUnavailableException(`Unsupported AI provider: ${providerName}`);
  }

  async generateStructured<T>(params: GenerateStructuredParams): Promise<AiGenerationResult<T>> {
    const provider = this.resolveProvider();
    const billing = params.billing;
    const idempotencyKey = billing?.idempotencyKey || (billing ? `ai:${billing.feature}:${billing.action}:${billing.sourceEntityId || Date.now()}` : undefined);
    if (billing) await this.quotaService.assertCanConsume({ organizationId: billing.organizationId, metric: 'ai.customer_unit', quantity: 1, idempotencyKey });
    try {
      const result = await provider.generateStructured<T>(params);
      if (billing && idempotencyKey) {
        await this.aiUsageService.record({
          organizationId: billing.organizationId,
          productId: billing.productId,
          feature: billing.feature,
          action: billing.action,
          provider: provider.name,
          model: provider.model,
          inputTokens: result.usage?.inputTokens,
          outputTokens: result.usage?.outputTokens,
          totalTokens: result.usage?.totalTokens,
          providerCostMinor: result.usage?.providerCostMinor,
          providerCostCurrency: result.usage?.providerCostCurrency,
          customerUsageUnits: 1,
          sourceType: billing.sourceType,
          sourceEntityId: billing.sourceEntityId,
          idempotencyKey,
        });
        await this.quotaService.consumeReservation(idempotencyKey);
      }
      return { data: result.data, provider: provider.name, model: provider.model, usage: result.usage };
    } catch (err) {
      if (idempotencyKey) await this.quotaService.releaseReservation(idempotencyKey);
      throw err;
    }
  }
}
