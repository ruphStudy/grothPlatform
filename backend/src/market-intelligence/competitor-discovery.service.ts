import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductsService } from '../products/products.service';
import { ResearchService } from '../research/research.service';
import { extractSourceDomain } from '../research/research-url.util';
import type { ResearchSearchResult } from '../research/types/research.types';
import { MarketCategoryService } from './market-category.service';
import type { MarketCategoryResult } from './types/market-category.types';
import type {
  CompetitorCandidate,
  CompetitorDiscoveryInput,
  CompetitorDiscoveryResult,
} from './types/competitor-discovery.types';

const DEFAULT_MAX_QUERIES = 3;
const DEFAULT_MAX_RESULTS = 10;
const PER_QUERY_SEARCH_RESULTS = 10;

// Domains that are essentially never a competing product/company site.
const NOISE_DOMAINS = new Set([
  'wikipedia.org',
  'youtube.com',
  'reddit.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'instagram.com',
  'tiktok.com',
  'quora.com',
  'medium.com',
  'apps.apple.com',
  'play.google.com',
  'github.com',
]);

// Editorial/listicle titles ("10 Best X", "X vs Y", "Alternatives to X") —
// informational pages, not competitor candidates themselves (this sprint
// does not crawl them for the products they mention).
const EDITORIAL_TITLE_PATTERN = /\b(best|top\s?\d+|alternatives?(\s+to)?|\bvs\.?\b|comparison|review)\b/i;

const PRODUCT_WORDING_PATTERN = /\b(platform|software|app|tool|solution|service)\b/i;

interface CandidateAccumulator {
  candidate: CompetitorCandidate;
  bestRank: number;
}

@Injectable()
export class CompetitorDiscoveryService {
  constructor(
    private readonly configService: ConfigService,
    private readonly productsService: ProductsService,
    private readonly marketCategoryService: MarketCategoryService,
    private readonly researchService: ResearchService,
  ) {}

  /**
   * Product-scoped orchestration. Tenant lookup happens first (and again,
   * cheaply, inside MarketCategoryService's own discovery) — no research
   * call is made until both succeed, so cross-tenant/missing-product
   * requests never consume research credits.
   */
  async discoverForProduct(organizationId: string, productId: string, userId: string): Promise<CompetitorDiscoveryResult> {
    const product = await this.productsService.findOne(organizationId, productId, userId);
    const marketCategory = await this.marketCategoryService.discoverForProduct(organizationId, productId, userId);

    return this.discover({
      productName: product.name,
      productWebsiteUrl: product.websiteUrl,
      marketCategory,
    });
  }

  async discover(input: CompetitorDiscoveryInput): Promise<CompetitorDiscoveryResult> {
    const queries = this.buildQueries(input.marketCategory);

    if (queries.length === 0) {
      return {
        marketCategory: input.marketCategory.primaryCategory,
        queriesUsed: [],
        competitors: [],
        excludedResults: 0,
        researchedAt: new Date(),
        warnings: ['Not enough market-category evidence to discover competitors.'],
      };
    }

    const ownDomain = input.productWebsiteUrl ? extractSourceDomain(input.productWebsiteUrl) : undefined;

    const byDomain = new Map<string, CandidateAccumulator>();
    let excludedResults = 0;

    for (const query of queries) {
      const response = await this.researchService.search({ query, maxResults: PER_QUERY_SEARCH_RESULTS });

      response.results.forEach((result, rank) => {
        const domain = result.sourceDomain ?? extractSourceDomain(result.url);
        if (!domain || (ownDomain && domain === ownDomain) || this.isNoiseDomain(domain) || this.isEditorialResult(result)) {
          excludedResults += 1;
          return;
        }

        const existing = byDomain.get(domain);
        if (existing) {
          if (!existing.candidate.sourceQueries.includes(query)) existing.candidate.sourceQueries.push(query);
          if ((result.snippet?.length ?? 0) > (existing.candidate.snippet?.length ?? 0)) {
            existing.candidate.title = result.title || existing.candidate.title;
            existing.candidate.snippet = result.snippet || existing.candidate.snippet;
          }
          existing.bestRank = Math.min(existing.bestRank, rank);
        } else {
          byDomain.set(domain, {
            candidate: {
              name: this.deriveName(result, domain),
              url: result.url,
              domain,
              title: result.title,
              snippet: result.snippet,
              sourceQueries: [query],
              relevanceScore: 0,
              reasons: [],
            },
            bestRank: rank,
          });
        }
      });
    }

    const scored = Array.from(byDomain.values()).map(({ candidate, bestRank }) => {
      const { score, reasons } = this.scoreCandidate(candidate, bestRank, input.marketCategory);
      return { ...candidate, relevanceScore: score, reasons };
    });

    scored.sort((a, b) => b.relevanceScore - a.relevanceScore || a.domain.localeCompare(b.domain));

    return {
      marketCategory: input.marketCategory.primaryCategory,
      queriesUsed: queries,
      competitors: scored.slice(0, this.getMaxResults()),
      excludedResults,
      researchedAt: new Date(),
      warnings: [],
    };
  }

  private buildQueries(marketCategory: MarketCategoryResult): string[] {
    const hasEvidence = Boolean(marketCategory.primaryCategory) || marketCategory.categoryTerms.length > 0;
    if (!hasEvidence) return [];

    const maxQueries = this.getMaxQueries();
    const queries: string[] = [];
    const seen = new Set<string>();

    const addQuery = (query: string) => {
      const normalized = query.trim();
      const key = normalized.toLowerCase();
      if (!normalized || seen.has(key) || queries.length >= maxQueries) return;
      seen.add(key);
      queries.push(normalized);
    };

    if (marketCategory.primaryCategory) {
      addQuery(`${marketCategory.primaryCategory} competitors`);
    }

    const templates = [(term: string) => `best ${term} platforms`, (term: string) => `${term} software`];
    marketCategory.categoryTerms.forEach((term, i) => {
      addQuery(templates[i % templates.length](term));
    });

    return queries;
  }

  private isNoiseDomain(domain: string): boolean {
    return Array.from(NOISE_DOMAINS).some((noise) => domain === noise || domain.endsWith(`.${noise}`));
  }

  private isEditorialResult(result: ResearchSearchResult): boolean {
    return EDITORIAL_TITLE_PATTERN.test(result.title ?? '');
  }

  private deriveName(result: ResearchSearchResult, domain: string): string {
    const title = result.title?.trim();
    if (!title) return domain;
    const cleaned = title.replace(/\s*[-|]\s*(Home|Official Site|Company)\s*$/i, '').trim();
    return cleaned || domain;
  }

  private scoreCandidate(
    candidate: CompetitorCandidate,
    bestRank: number,
    marketCategory: MarketCategoryResult,
  ): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];

    if (candidate.sourceQueries.length > 1) {
      score += 25 * Math.min(candidate.sourceQueries.length, 3);
      reasons.push(`Appeared in ${candidate.sourceQueries.length} competitor research queries`);
    }

    const haystack = `${candidate.title ?? ''} ${candidate.snippet ?? ''}`.toLowerCase();
    const matchedTerms = marketCategory.categoryTerms.filter((term) => haystack.includes(term.toLowerCase()));
    if (matchedTerms.length > 0) {
      score += 15 * Math.min(matchedTerms.length, 3);
      reasons.push(`Matches ${marketCategory.primaryCategory ?? 'category'} terminology`);
    }

    if (PRODUCT_WORDING_PATTERN.test(haystack)) {
      score += 15;
      reasons.push('Search result describes a competing software platform');
    }

    if (bestRank < 3) {
      score += 10;
      reasons.push('Ranked highly in competitor research results');
    } else if (bestRank < 5) {
      score += 5;
    }

    return { score: this.clamp(score, 0, 100), reasons };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private getMaxQueries(): number {
    return this.getEnvNumber('COMPETITOR_DISCOVERY_MAX_QUERIES', DEFAULT_MAX_QUERIES);
  }

  private getMaxResults(): number {
    return this.getEnvNumber('COMPETITOR_DISCOVERY_MAX_RESULTS', DEFAULT_MAX_RESULTS);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
