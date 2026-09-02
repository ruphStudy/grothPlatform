import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductsService } from '../products/products.service';
import { extractSourceDomain } from '../research/research-url.util';
import { ProductWebsiteKnowledgeService } from '../website-intelligence/product-website-knowledge.service';
import { CompetitorDiscoveryService } from './competitor-discovery.service';
import { MarketCategoryService } from './market-category.service';
import type { CompetitorCandidate } from './types/competitor-discovery.types';
import type {
  CompetitorAnalysisFailure,
  CompetitorWebsiteAnalysis,
  CompetitorWebsiteAnalysisBatchResult,
} from './types/competitor-analysis.types';

const DEFAULT_MAX_COMPETITORS = 5;
const DEFAULT_CONCURRENCY = 2;

type AnalysisOutcome =
  | { ok: true; analysis: CompetitorWebsiteAnalysis }
  | { ok: false; failure: CompetitorAnalysisFailure };

export interface CompetitorAnalysisPreview {
  marketCategory?: string;
  discoveredCompetitors: number;
  analyzedCompetitors: CompetitorWebsiteAnalysis[];
  analysisFailures: CompetitorAnalysisFailure[];
  stats: { discovered: number; attempted: number; analyzed: number; failed: number };
  researchedAt: Date;
  analyzedAt: Date;
  warnings: string[];
}

@Injectable()
export class CompetitorWebsiteAnalysisService {
  private readonly logger = new Logger(CompetitorWebsiteAnalysisService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly productsService: ProductsService,
    private readonly marketCategoryService: MarketCategoryService,
    private readonly competitorDiscoveryService: CompetitorDiscoveryService,
    private readonly productWebsiteKnowledgeService: ProductWebsiteKnowledgeService,
  ) {}

  /**
   * Product-scoped orchestration. Tenant check runs first (before any
   * research or website analysis); market category + competitor discovery
   * are reused as-is, not reimplemented here.
   */
  async analyzeForProduct(organizationId: string, productId: string, userId: string): Promise<CompetitorAnalysisPreview> {
    const product = await this.productsService.findOne(organizationId, productId, userId);
    const marketCategory = await this.marketCategoryService.discoverForProduct(organizationId, productId, userId);
    const discovery = await this.competitorDiscoveryService.discover({
      productName: product.name,
      productWebsiteUrl: product.websiteUrl,
      marketCategory,
    });

    if (discovery.competitors.length === 0) {
      return {
        marketCategory: discovery.marketCategory,
        discoveredCompetitors: 0,
        analyzedCompetitors: [],
        analysisFailures: [],
        stats: { discovered: 0, attempted: 0, analyzed: 0, failed: 0 },
        researchedAt: discovery.researchedAt,
        analyzedAt: new Date(),
        warnings: discovery.warnings,
      };
    }

    const ownDomain = product.websiteUrl ? extractSourceDomain(product.websiteUrl) : undefined;
    const batch = await this.analyzeCompetitors(discovery.competitors, { excludeDomain: ownDomain });

    return {
      marketCategory: discovery.marketCategory,
      discoveredCompetitors: discovery.competitors.length,
      analyzedCompetitors: batch.competitors,
      analysisFailures: batch.failures,
      stats: {
        discovered: discovery.competitors.length,
        attempted: batch.attemptedCount,
        analyzed: batch.analyzedCount,
        failed: batch.failedCount,
      },
      researchedAt: discovery.researchedAt,
      analyzedAt: batch.analyzedAt,
      warnings: discovery.warnings,
    };
  }

  /**
   * Analyzes already-discovered competitor candidates. Does not discover
   * competitors itself — callers (e.g. analyzeForProduct above, or tests)
   * supply the candidate list.
   */
  async analyzeCompetitors(
    competitors: CompetitorCandidate[],
    options?: { excludeDomain?: string },
  ): Promise<CompetitorWebsiteAnalysisBatchResult> {
    const excludeDomain = options?.excludeDomain ? this.normalizeDomain(options.excludeDomain) : undefined;

    const deduped = this.dedupeByDomain(competitors).filter((c) => !excludeDomain || c.domain !== excludeDomain);
    const targets = deduped.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, this.getMaxCompetitors());

    if (targets.length === 0) {
      const now = new Date();
      return { competitors: [], failures: [], attemptedCount: 0, analyzedCount: 0, failedCount: 0, analyzedAt: now };
    }

    const outcomes = await this.mapWithConcurrency(targets, this.getConcurrency(), (candidate) =>
      this.analyzeOne(candidate),
    );

    const competitorsResult: CompetitorWebsiteAnalysis[] = [];
    const failures: CompetitorAnalysisFailure[] = [];
    for (const outcome of outcomes) {
      if (outcome.ok) competitorsResult.push(outcome.analysis);
      else failures.push(outcome.failure);
    }

    return {
      competitors: competitorsResult,
      failures,
      attemptedCount: targets.length,
      analyzedCount: competitorsResult.length,
      failedCount: failures.length,
      analyzedAt: new Date(),
    };
  }

  private async analyzeOne(candidate: CompetitorCandidate): Promise<AnalysisOutcome> {
    const rootUrl = this.toWebsiteRoot(candidate.url, candidate.domain);
    try {
      const knowledge = await this.productWebsiteKnowledgeService.buildKnowledge(rootUrl);
      return {
        ok: true,
        analysis: {
          name: candidate.name,
          url: candidate.url,
          domain: candidate.domain,
          relevanceScore: candidate.relevanceScore,
          reasons: candidate.reasons,
          sourceQueries: candidate.sourceQueries,
          finalUrl: knowledge.source.finalHomepageUrl,
          confidenceScore: knowledge.assessment.confidenceScore,
          quality: knowledge.assessment.quality,
          title: knowledge.identity.title,
          metaDescription: knowledge.identity.metaDescription,
          keyStatements: knowledge.identity.keyStatements,
          features: knowledge.features,
          pricingSignals: knowledge.pricing.signals,
          faqs: knowledge.faqs,
          documentation: knowledge.documentation,
          callsToAction: knowledge.callsToAction,
          pagesAnalyzed: knowledge.pagesAnalyzed,
          missingInformation: knowledge.assessment.missingInformation,
          warnings: knowledge.assessment.warnings,
          failures: knowledge.failures,
          analyzedAt: new Date(),
        },
      };
    } catch (err) {
      const reason = err instanceof HttpException ? err.message : 'Competitor website could not be analyzed';
      this.logger.warn(`Competitor website analysis failed for ${candidate.domain}: ${(err as Error).message}`);
      return { ok: false, failure: { name: candidate.name, domain: candidate.domain, url: candidate.url, reason } };
    }
  }

  /**
   * A research result may point to a deep page (e.g. /pricing). Competitor
   * analysis should run against the site root, not an arbitrary deep path.
   */
  private toWebsiteRoot(url: string, domain: string): string {
    try {
      const parsed = new URL(url);
      const port = parsed.port ? `:${parsed.port}` : '';
      return `${parsed.protocol}//${parsed.hostname}${port}/`;
    } catch {
      return `https://${domain}/`;
    }
  }

  private dedupeByDomain(competitors: CompetitorCandidate[]): CompetitorCandidate[] {
    const byDomain = new Map<string, CompetitorCandidate>();
    for (const candidate of competitors) {
      const domain = this.normalizeDomain(candidate.domain);
      const existing = byDomain.get(domain);
      if (!existing || candidate.relevanceScore > existing.relevanceScore) {
        byDomain.set(domain, { ...candidate, domain });
      }
    }
    return Array.from(byDomain.values());
  }

  private normalizeDomain(domain: string): string {
    return (extractSourceDomain(domain) ?? domain.trim().toLowerCase()).replace(/^www\./, '');
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let cursor = 0;

    const runWorker = async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await worker(items[index]);
      }
    };

    const workerCount = Math.max(1, Math.min(concurrency, items.length));
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    return results;
  }

  private getMaxCompetitors(): number {
    return this.getEnvNumber('COMPETITOR_ANALYSIS_MAX_COMPETITORS', DEFAULT_MAX_COMPETITORS);
  }

  private getConcurrency(): number {
    return this.getEnvNumber('COMPETITOR_ANALYSIS_CONCURRENCY', DEFAULT_CONCURRENCY);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
