import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiProvider, AiProviderResult, GenerateStructuredParams } from '../interfaces/ai-provider.interface';

const DEFAULT_MODEL = 'gpt-4o-mini';

@Injectable()
export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  readonly model: string;
  private client: OpenAI | null = null;

  constructor(private readonly configService: ConfigService) {
    this.model = this.configService.get<string>('OPENAI_MODEL') || DEFAULT_MODEL;
  }

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!apiKey) {
        throw new ServiceUnavailableException('AI provider is not configured');
      }
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  async generateStructured<T>({ systemPrompt, userPrompt }: GenerateStructuredParams): Promise<AiProviderResult<T>> {
    const client = this.getClient();

    let completion;
    try {
      completion = await client.chat.completions.create({
        model: this.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });
    } catch {
      throw new ServiceUnavailableException('AI provider request failed');
    }

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new ServiceUnavailableException('AI provider returned an empty response');
    }

    try {
      const data = JSON.parse(content) as T;
      const usage = completion.usage
        ? {
            inputTokens: completion.usage.prompt_tokens,
            outputTokens: completion.usage.completion_tokens,
            totalTokens: completion.usage.total_tokens,
            providerCostMinor: undefined,
            providerCostCurrency: 'USD',
          }
        : undefined;
      return { data, usage };
    } catch {
      throw new ServiceUnavailableException('AI provider returned invalid JSON');
    }
  }
}
