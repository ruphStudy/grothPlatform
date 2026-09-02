import { HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ResearchProvider } from '../interfaces/research-provider.interface';
import { extractSourceDomain } from '../research-url.util';
import type { ResearchSearchRequest, ResearchSearchResponse, ResearchSearchResult } from '../types/research.types';

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';

interface TavilyRawResult {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
}

interface TavilyRawResponse {
  results?: TavilyRawResult[];
}

/**
 * Tavily Basic Search only — no advanced search, extract, crawl, or
 * generated answers. Translates Tavily's response into the generic
 * ResearchSearchResult shape; never exposes the raw payload or API key.
 */
@Injectable()
export class TavilyResearchProvider implements ResearchProvider {
  readonly name = 'tavily';
  private readonly logger = new Logger(TavilyResearchProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async search(request: ResearchSearchRequest): Promise<ResearchSearchResponse> {
    const apiKey = this.configService.get<string>('TAVILY_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('Tavily research provider is not configured');
    }

    const body: Record<string, unknown> = {
      query: request.query,
      search_depth: 'basic',
      max_results: request.maxResults ?? 10,
      include_answer: false,
      include_raw_content: false,
      include_images: false,
    };
    if (request.domains?.length) body.include_domains = request.domains;
    if (request.excludeDomains?.length) body.exclude_domains = request.excludeDomains;

    let response: Response;
    try {
      response = await fetch(TAVILY_SEARCH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.logger.warn(`Tavily request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Research provider is unavailable');
    }

    if (response.status === 401 || response.status === 403) {
      throw new ServiceUnavailableException('Research provider authentication failed');
    }
    if (response.status === 429) {
      throw new HttpException('Research provider rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!response.ok) {
      this.logger.warn(`Tavily request returned status ${response.status}`);
      throw new ServiceUnavailableException('Research provider is unavailable');
    }

    let payload: TavilyRawResponse;
    try {
      payload = (await response.json()) as TavilyRawResponse;
    } catch {
      throw new ServiceUnavailableException('Research provider returned an invalid response');
    }

    const results = (payload.results ?? []).map((raw) => this.normalizeResult(raw));

    return { provider: this.name, query: request.query, results, searchedAt: new Date() };
  }

  private normalizeResult(raw: TavilyRawResult): ResearchSearchResult {
    const url = raw.url ?? '';
    const parsedDate = raw.published_date ? new Date(raw.published_date) : undefined;
    const publishedAt = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : undefined;

    return {
      title: raw.title?.trim() || url,
      url,
      snippet: raw.content?.trim() || undefined,
      publishedAt,
      sourceDomain: extractSourceDomain(url),
    };
  }
}
