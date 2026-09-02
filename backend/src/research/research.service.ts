import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ResearchProvider } from './interfaces/research-provider.interface';
import { DisabledResearchProvider } from './providers/disabled-research.provider';
import { extractSourceDomain } from './research-url.util';
import type { ResearchSearchRequest, ResearchSearchResponse } from './types/research.types';

const DEFAULT_MAX_RESULTS = 10;
const MAX_RESULTS_CAP = 25;

/**
 * Provider-agnostic entry point for external research. Consumers (future
 * competitor discovery, market research, etc.) call search() here and must
 * never depend on a concrete provider class directly.
 */
@Injectable()
export class ResearchService {
  constructor(
    private readonly configService: ConfigService,
    private readonly disabledResearchProvider: DisabledResearchProvider,
  ) {}

  async search(request: ResearchSearchRequest): Promise<ResearchSearchResponse> {
    const query = request.query?.trim();
    if (!query) {
      throw new BadRequestException('Research query is required');
    }

    const normalizedRequest: ResearchSearchRequest = {
      ...request,
      query,
      maxResults: this.normalizeMaxResults(request.maxResults),
      domains: this.normalizeDomains(request.domains),
      excludeDomains: this.normalizeDomains(request.excludeDomains),
    };

    const provider = this.resolveProvider();
    return provider.search(normalizedRequest);
  }

  private resolveProvider(): ResearchProvider {
    const providerName = this.configService.get<string>('RESEARCH_PROVIDER') ?? 'disabled';
    if (providerName === 'disabled') {
      return this.disabledResearchProvider;
    }
    throw new ServiceUnavailableException(`Unsupported research provider: ${providerName}`);
  }

  private normalizeMaxResults(value?: number): number {
    if (!Number.isFinite(value) || !value || value <= 0) {
      return DEFAULT_MAX_RESULTS;
    }
    return Math.min(Math.floor(value), MAX_RESULTS_CAP);
  }

  private normalizeDomains(domains?: string[]): string[] | undefined {
    if (!domains || domains.length === 0) return undefined;
    const normalized = Array.from(
      new Set(domains.map((d) => extractSourceDomain(d)).filter((d): d is string => Boolean(d))),
    );
    return normalized.length > 0 ? normalized : undefined;
  }
}
