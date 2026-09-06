import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { CreativeConfigurationError, CreativeInvalidAssetError, CreativeProviderError, CreativeValidationError } from '../errors/creative.errors';
import { CREATIVE_PROVIDER_TOKEN } from '../providers/creative-provider.interface';
import type { CreativeProvider } from '../providers/creative-provider.interface';
import { CREATIVE_KINDS } from '../types/creative.types';
import type { CreativeGenerationRequest, CreativeGenerationResult } from '../types/creative.types';

const DEFAULT_MAX_PROMPT_CHARS = 10000;
const DEFAULT_MIN_DIMENSION = 256;
const DEFAULT_MAX_DIMENSION = 4096;
const MAX_NEGATIVE_PROMPT_CHARS = 2000;
const MAX_METADATA_JSON_CHARS = 5000;
const MAX_SOURCE_IDS = 50;
const MAX_SOURCE_ID_CHARS = 200;
const VALID_QUALITIES = ['standard', 'high'];
// Simple numeric ratio only (e.g. "16:9", "1:1", "4:5") — mapping to a
// provider-specific enum belongs to a concrete provider adapter, not here.
const ASPECT_RATIO_PATTERN = /^\d{1,3}:\d{1,3}$/;

/**
 * Creative-kind-agnostic image generation engine. Mirrors the 15A
 * ContentGenerationEngineService pattern: it knows nothing about social
 * images, blog heroes, thumbnails, or brand assets — kind-specific prompt
 * construction and persistence belong to 17B+. This service only validates
 * a request, calls the single DI-injected provider exactly once, and
 * normalizes the result (and any provider error) into a provider-neutral
 * shape.
 */
@Injectable()
export class CreativeEngineService {
  private readonly logger = new Logger(CreativeEngineService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(CREATIVE_PROVIDER_TOKEN) private readonly provider: CreativeProvider,
  ) {}

  async generate(request: CreativeGenerationRequest): Promise<CreativeGenerationResult> {
    this.validate(request);

    if (!this.provider.isConfigured()) {
      throw new CreativeConfigurationError('The creative provider is not configured.');
    }

    const startedAt = Date.now();
    let response;
    try {
      response = await this.provider.generate({
        prompt: request.prompt.trim(),
        negativePrompt: request.negativePrompt?.trim(),
        model: this.configService.get<string>('CREATIVE_MODEL'),
        width: request.width,
        height: request.height,
        aspectRatio: request.aspectRatio,
        quality: request.quality,
      });
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      this.logOutcome(request.kind, this.provider.name, undefined, request.width, request.height, latencyMs, false);
      throw err instanceof CreativeProviderError ? err : new CreativeProviderError('creative_provider_request_failed', 'The creative provider request failed.');
    }
    const latencyMs = Date.now() - startedAt;

    const asset = response.asset;
    const hasUsableAsset = !!asset && (!!asset.url || !!asset.base64);
    if (!hasUsableAsset) {
      this.logOutcome(request.kind, this.provider.name, response.model, request.width, request.height, latencyMs, false);
      throw new CreativeInvalidAssetError('The creative provider did not return a usable image asset.');
    }

    this.logOutcome(request.kind, this.provider.name, response.model, asset.width ?? request.width, asset.height ?? request.height, latencyMs, true);

    return {
      id: randomUUID(),
      kind: request.kind,
      provider: this.provider.name,
      model: response.model,
      asset,
      revisedPrompt: response.revisedPrompt,
      usage: response.usage,
      cost: response.cost,
      latencyMs,
      generatedAt: new Date(),
      metadata: request.metadata,
    };
  }

  // ---------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------

  private validate(request: CreativeGenerationRequest): void {
    if (!CREATIVE_KINDS.includes(request.kind)) {
      throw new CreativeValidationError(`Unsupported creative kind: ${String(request.kind)}`);
    }
    if (typeof request.prompt !== 'string' || request.prompt.trim().length === 0) {
      throw new CreativeValidationError('The prompt must not be empty.');
    }
    if (request.prompt.length > this.getMaxPromptChars()) {
      throw new CreativeValidationError('The prompt exceeds the maximum allowed length.');
    }
    if (request.negativePrompt !== undefined && request.negativePrompt.length > MAX_NEGATIVE_PROMPT_CHARS) {
      throw new CreativeValidationError(`negativePrompt must not exceed ${MAX_NEGATIVE_PROMPT_CHARS} characters.`);
    }
    if (request.quality !== undefined && !VALID_QUALITIES.includes(request.quality)) {
      throw new CreativeValidationError(`quality must be one of: ${VALID_QUALITIES.join(', ')}.`);
    }
    const minDimension = this.getMinDimension();
    const maxDimension = this.getMaxDimension();
    if (request.width !== undefined && (!Number.isInteger(request.width) || request.width < minDimension || request.width > maxDimension)) {
      throw new CreativeValidationError(`width must be an integer between ${minDimension} and ${maxDimension}.`);
    }
    if (request.height !== undefined && (!Number.isInteger(request.height) || request.height < minDimension || request.height > maxDimension)) {
      throw new CreativeValidationError(`height must be an integer between ${minDimension} and ${maxDimension}.`);
    }
    if (request.aspectRatio !== undefined && !ASPECT_RATIO_PATTERN.test(request.aspectRatio)) {
      throw new CreativeValidationError('aspectRatio must be a simple numeric ratio, e.g. "16:9".');
    }
    if (request.sourceContext?.sourceIds) {
      if (request.sourceContext.sourceIds.length > MAX_SOURCE_IDS) {
        throw new CreativeValidationError(`sourceContext.sourceIds must not exceed ${MAX_SOURCE_IDS} entries.`);
      }
      if (request.sourceContext.sourceIds.some((id) => typeof id !== 'string' || id.length > MAX_SOURCE_ID_CHARS)) {
        throw new CreativeValidationError(`Each sourceContext.sourceIds entry must not exceed ${MAX_SOURCE_ID_CHARS} characters.`);
      }
    }
    if (request.metadata !== undefined && JSON.stringify(request.metadata).length > MAX_METADATA_JSON_CHARS) {
      throw new CreativeValidationError(`metadata must not exceed ${MAX_METADATA_JSON_CHARS} serialized characters.`);
    }
  }

  // ---------------------------------------------------------------------
  // Config-driven defaults
  // ---------------------------------------------------------------------

  private getMaxPromptChars(): number {
    return this.getEnvNumber('CREATIVE_MAX_PROMPT_CHARS', DEFAULT_MAX_PROMPT_CHARS);
  }

  private getMinDimension(): number {
    return this.getEnvNumber('CREATIVE_MIN_DIMENSION', DEFAULT_MIN_DIMENSION);
  }

  private getMaxDimension(): number {
    return this.getEnvNumber('CREATIVE_MAX_DIMENSION', DEFAULT_MAX_DIMENSION);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  // ---------------------------------------------------------------------
  // Logging — kind/provider/model/dimensions/latency only. Never the
  // prompt, negative prompt, returned base64, or metadata.
  // ---------------------------------------------------------------------

  private logOutcome(
    kind: string,
    provider: string,
    model: string | undefined,
    width: number | undefined,
    height: number | undefined,
    latencyMs: number,
    success: boolean,
  ): void {
    const dims = width && height ? ` ${width}x${height}` : '';
    this.logger.log(`kind=${kind} provider=${provider} model=${model ?? 'unknown'}${dims} success=${success} latencyMs=${latencyMs}`);
  }
}
