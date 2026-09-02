import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiProvider, GenerateStructuredParams } from '../interfaces/ai-provider.interface';

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

  async generateStructured<T>({ systemPrompt, userPrompt }: GenerateStructuredParams): Promise<T> {
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
      return JSON.parse(content) as T;
    } catch {
      throw new ServiceUnavailableException('AI provider returned invalid JSON');
    }
  }
}
