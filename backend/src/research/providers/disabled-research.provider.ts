import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { ResearchProvider } from '../interfaces/research-provider.interface';
import type { ResearchSearchRequest, ResearchSearchResponse } from '../types/research.types';

/**
 * Default provider when no external research provider is configured.
 * Fails loudly rather than returning fake results, so missing
 * configuration is obvious to callers instead of silently degrading.
 */
@Injectable()
export class DisabledResearchProvider implements ResearchProvider {
  readonly name = 'disabled';

  async search(_request: ResearchSearchRequest): Promise<ResearchSearchResponse> {
    throw new ServiceUnavailableException('External research provider is not configured');
  }
}
