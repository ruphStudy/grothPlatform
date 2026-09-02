import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider, GenerateStructuredParams } from './interfaces/ai-provider.interface';
import { OpenAiProvider } from './providers/openai.provider';

export interface AiGenerationResult<T> {
  data: T;
  provider: string;
  model: string;
}

@Injectable()
export class AiService {
  constructor(
    private readonly configService: ConfigService,
    private readonly openAiProvider: OpenAiProvider,
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
    const data = await provider.generateStructured<T>(params);
    return { data, provider: provider.name, model: provider.model };
  }
}
