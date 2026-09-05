import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { ContentGenerationConfigurationError, ContentGenerationEmptyResultError, ContentGenerationValidationError } from '../errors/content-generation.errors';
import { OpenAiContentGenerationProvider } from '../providers/openai-content-generation.provider';
import type { ContentGenerationProvider } from '../providers/content-generation-provider.interface';
import type { ContentGenerationKind, ContentGenerationRequest, ContentGenerationResult, ContentGenerationUsage } from '../types/content-generation.types';
import { estimateContentGenerationCost } from './content-generation-cost.util';

const SUPPORTED_KINDS: ContentGenerationKind[] = ['blog', 'linkedin', 'x', 'facebook', 'instagram', 'newsletter', 'video_script', 'generic'];

const DEFAULT_MAX_PROMPT_CHARS = 50000;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_OUTPUT_TOKENS = 4000;
const DEFAULT_MODEL_FALLBACK = 'gpt-4o-mini';

const MIN_TEMPERATURE = 0;
const MAX_TEMPERATURE = 2;
const MAX_METADATA_JSON_CHARS = 5000;
const MAX_SOURCE_IDS = 50;
const MAX_SOURCE_ID_CHARS = 200;

/**
 * Content-type-agnostic generation engine. It knows nothing about blog,
 * social, or newsletter specifics, and never fetches Growth Strategy or
 * campaign data itself — prompt construction belongs to 15B, and topic/
 * pillar selection belongs to the 15C-15I content-type adapters that call
 * this engine. This service only validates a request, dispatches to a
 * single configured provider exactly once, and normalizes the result.
 */
@Injectable()
export class ContentGenerationEngineService {
  private readonly logger = new Logger(ContentGenerationEngineService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly openAiProvider: OpenAiContentGenerationProvider,
  ) {}

  async generate(request: ContentGenerationRequest): Promise<ContentGenerationResult> {
    this.validate(request);

    const provider = this.resolveProvider();
    if (!provider.isConfigured()) {
      throw new ContentGenerationConfigurationError('The content generation provider is not configured.');
    }
    const model = request.model ?? this.getDefaultModel();
    const temperature = request.temperature ?? this.getDefaultTemperature();
    const maxOutputTokens = request.maxOutputTokens ?? this.getMaxOutputTokensLimit();

    const startedAt = Date.now();
    let response;
    try {
      response = await provider.generate({
        prompt: request.prompt.trim(),
        systemPrompt: request.systemPrompt?.trim(),
        model,
        temperature,
        maxOutputTokens,
      });
    } catch (err) {
      this.logOutcome(request.kind, provider.name, model, Date.now() - startedAt, undefined, false);
      throw err;
    }
    const latencyMs = Date.now() - startedAt;

    const content = response.content.trim();
    if (!content) {
      this.logOutcome(request.kind, provider.name, response.model, latencyMs, response.usage, false);
      throw new ContentGenerationEmptyResultError('The content generation provider returned an empty result.');
    }

    const usage: ContentGenerationUsage = {
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens,
      totalTokens: response.usage?.totalTokens,
    };
    const cost = estimateContentGenerationCost(response.model, usage);

    this.logOutcome(request.kind, provider.name, response.model, latencyMs, usage, true);

    return {
      id: randomUUID(),
      kind: request.kind,
      content,
      provider: provider.name,
      model: response.model,
      finishReason: response.finishReason,
      usage,
      cost,
      latencyMs,
      generatedAt: new Date(),
      metadata: request.metadata,
    };
  }

  // ---------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------

  private validate(request: ContentGenerationRequest): void {
    if (!SUPPORTED_KINDS.includes(request.kind)) {
      throw new ContentGenerationValidationError(`Unsupported content generation kind: ${String(request.kind)}`);
    }
    if (typeof request.prompt !== 'string' || request.prompt.trim().length === 0) {
      throw new ContentGenerationValidationError('The prompt must not be empty.');
    }
    if (request.prompt.length > this.getMaxPromptChars()) {
      throw new ContentGenerationValidationError('The prompt exceeds the maximum allowed length.');
    }
    if (request.systemPrompt !== undefined && request.systemPrompt.trim().length === 0) {
      throw new ContentGenerationValidationError('The system prompt, if provided, must not be blank.');
    }
    if (request.temperature !== undefined) {
      if (typeof request.temperature !== 'number' || Number.isNaN(request.temperature) || request.temperature < MIN_TEMPERATURE || request.temperature > MAX_TEMPERATURE) {
        throw new ContentGenerationValidationError(`temperature must be a number between ${MIN_TEMPERATURE} and ${MAX_TEMPERATURE}.`);
      }
    }
    if (request.maxOutputTokens !== undefined) {
      const limit = this.getMaxOutputTokensLimit();
      if (!Number.isInteger(request.maxOutputTokens) || request.maxOutputTokens <= 0 || request.maxOutputTokens > limit) {
        throw new ContentGenerationValidationError(`maxOutputTokens must be a positive integer up to ${limit}.`);
      }
    }
    if (request.sourceContext?.sourceIds) {
      if (request.sourceContext.sourceIds.length > MAX_SOURCE_IDS) {
        throw new ContentGenerationValidationError(`sourceContext.sourceIds must not exceed ${MAX_SOURCE_IDS} entries.`);
      }
      if (request.sourceContext.sourceIds.some((id) => typeof id !== 'string' || id.length > MAX_SOURCE_ID_CHARS)) {
        throw new ContentGenerationValidationError(`Each sourceContext.sourceIds entry must not exceed ${MAX_SOURCE_ID_CHARS} characters.`);
      }
    }
    if (request.metadata !== undefined && JSON.stringify(request.metadata).length > MAX_METADATA_JSON_CHARS) {
      throw new ContentGenerationValidationError(`metadata must not exceed ${MAX_METADATA_JSON_CHARS} serialized characters.`);
    }
  }

  // ---------------------------------------------------------------------
  // Provider selection — the seam a future provider plugs into without any
  // content-type caller changing.
  // ---------------------------------------------------------------------

  private resolveProvider(): ContentGenerationProvider {
    const configured = this.configService.get<string>('CONTENT_GENERATION_PROVIDER') ?? 'openai';
    switch (configured) {
      case 'openai':
      default:
        return this.openAiProvider;
    }
  }

  // ---------------------------------------------------------------------
  // Config-driven defaults
  // ---------------------------------------------------------------------

  private getDefaultModel(): string {
    return this.configService.get<string>('CONTENT_GENERATION_MODEL') ?? this.configService.get<string>('OPENAI_MODEL') ?? DEFAULT_MODEL_FALLBACK;
  }

  private getDefaultTemperature(): number {
    return this.getEnvNumber('CONTENT_GENERATION_DEFAULT_TEMPERATURE', DEFAULT_TEMPERATURE);
  }

  private getMaxOutputTokensLimit(): number {
    return this.getEnvNumber('CONTENT_GENERATION_MAX_OUTPUT_TOKENS', DEFAULT_MAX_OUTPUT_TOKENS);
  }

  private getMaxPromptChars(): number {
    return this.getEnvNumber('CONTENT_GENERATION_MAX_PROMPT_CHARS', DEFAULT_MAX_PROMPT_CHARS);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  // ---------------------------------------------------------------------
  // Logging — kind/provider/model/latency/tokens only, never prompts,
  // generated content, API keys, or raw metadata.
  // ---------------------------------------------------------------------

  private logOutcome(
    kind: ContentGenerationKind,
    provider: string,
    model: string,
    latencyMs: number,
    usage: ContentGenerationUsage | undefined,
    success: boolean,
  ): void {
    const tokenPart = usage?.totalTokens !== undefined ? ` totalTokens=${usage.totalTokens}` : '';
    this.logger.log(`kind=${kind} provider=${provider} model=${model} success=${success} latencyMs=${latencyMs}${tokenPart}`);
  }
}
