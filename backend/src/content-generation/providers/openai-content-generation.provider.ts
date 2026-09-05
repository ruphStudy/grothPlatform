import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { ContentGenerationProviderError } from '../errors/content-generation.errors';
import type { ContentGenerationProviderRequest, ContentGenerationProviderResponse } from '../types/content-generation-provider.types';
import type { ContentGenerationProvider } from './content-generation-provider.interface';

// The existing backend/src/ai AiService/OpenAiProvider is hardcoded to
// forced-JSON structured output for Product Intelligence and exposes no
// temperature/max-output-tokens/usage controls, so it can't be reused as-is
// for free-text content generation. This adapter reuses the same
// OPENAI_API_KEY config var and the same SDK — it is not a parallel
// retry/HTTP stack, just the plain-text completion path that infra lacks.
@Injectable()
export class OpenAiContentGenerationProvider implements ContentGenerationProvider {
  readonly name = 'openai';
  private client: OpenAI | undefined;

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return !!this.configService.get<string>('OPENAI_API_KEY');
  }

  async generate(request: ContentGenerationProviderRequest): Promise<ContentGenerationProviderResponse> {
    const client = this.getClient();

    let completion;
    try {
      completion = await client.chat.completions.create({
        model: request.model,
        temperature: request.temperature,
        max_completion_tokens: request.maxOutputTokens,
        messages: [
          ...(request.systemPrompt ? [{ role: 'system' as const, content: request.systemPrompt }] : []),
          { role: 'user' as const, content: request.prompt },
        ],
      });
    } catch (err) {
      throw this.normalizeError(err);
    }

    const choice = completion.choices[0];
    return {
      content: choice?.message?.content ?? '',
      model: completion.model,
      finishReason: choice?.finish_reason ?? undefined,
      usage: completion.usage
        ? {
            inputTokens: completion.usage.prompt_tokens,
            outputTokens: completion.usage.completion_tokens,
            totalTokens: completion.usage.total_tokens,
          }
        : undefined,
    };
  }

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!apiKey) {
        throw new ContentGenerationProviderError('provider_not_configured', 'The content generation provider is not configured.');
      }
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  private normalizeError(err: unknown): ContentGenerationProviderError {
    if (err instanceof OpenAI.AuthenticationError) {
      return new ContentGenerationProviderError('provider_auth_failed', 'The content generation provider rejected the request credentials.');
    }
    if (err instanceof OpenAI.RateLimitError) {
      return new ContentGenerationProviderError('provider_rate_limited', 'The content generation provider is rate-limiting requests.');
    }
    if (err instanceof OpenAI.APIConnectionTimeoutError) {
      return new ContentGenerationProviderError('provider_timeout', 'The content generation provider timed out.');
    }
    return new ContentGenerationProviderError('provider_request_failed', 'The content generation provider request failed.');
  }
}
