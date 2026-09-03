import { Injectable } from '@nestjs/common';
import { AudienceJtbdService } from '../audience-intelligence/audience-jtbd.service';
import { AudiencePainPointService } from '../audience-intelligence/audience-pain-point.service';
import { AudiencePrioritizationService } from '../audience-intelligence/audience-prioritization.service';
import { AudienceSegmentService } from '../audience-intelligence/audience-segment.service';
import { AudienceSignalService } from '../audience-intelligence/audience-signal.service';
import { BuyerUserMapService } from '../audience-intelligence/buyer-user-map.service';
import { IcpService } from '../audience-intelligence/icp.service';
import { CompetitorDiscoveryService } from '../market-intelligence/competitor-discovery.service';
import { CompetitorFeatureComparisonService } from '../market-intelligence/competitor-feature-comparison.service';
import { CompetitorWebsiteAnalysisService } from '../market-intelligence/competitor-website-analysis.service';
import { MarketCategoryService } from '../market-intelligence/market-category.service';
import type { CompetitorWebsiteAnalysisBatchResult } from '../market-intelligence/types/competitor-analysis.types';
import type { MarketCategoryResult } from '../market-intelligence/types/market-category.types';
import { ProductsService } from '../products/products.service';
import { extractSourceDomain } from '../research/research-url.util';
import { ProductWebsiteKnowledgeService } from '../website-intelligence/product-website-knowledge.service';
import type { ProductWebsiteKnowledge } from '../website-intelligence/product-website-knowledge.types';
import { CompetitorKeywordGapService } from './competitor-keyword-gap.service';
import { KeywordAudienceMapService } from './keyword-audience-map.service';
import { KeywordClusterService } from './keyword-cluster.service';
import { KeywordIntentService } from './keyword-intent.service';
import { KeywordLongTailService } from './keyword-long-tail.service';
import { KeywordOpportunityService } from './keyword-opportunity.service';
import { KeywordSignalService } from './keyword-signal.service';
import type { CompetitorKeywordGapResult } from './types/competitor-keyword-gap.types';
import type { KeywordAudienceMapResult } from './types/keyword-audience-map.types';
import type { KeywordClusterResult } from './types/keyword-cluster.types';
import type { KeywordIntentResult } from './types/keyword-intent.types';
import type { KeywordLongTailResult } from './types/keyword-long-tail.types';
import type { KeywordOpportunityResult } from './types/keyword-opportunity.types';
import type { KeywordSignalExtractionInput, KeywordSignalProductInput, KeywordSignalResult } from './types/keyword-signal.types';
import type { AudienceSignalResult } from '../audience-intelligence/types/audience-signal.types';
import type { AudienceSegmentResult } from '../audience-intelligence/types/audience-segment.types';
import type { IcpResult } from '../audience-intelligence/types/icp.types';
import type { BuyerUserMapResult } from '../audience-intelligence/types/buyer-user-map.types';
import type { AudiencePainPointResult } from '../audience-intelligence/types/audience-pain-point.types';
import type { AudienceJtbdResult } from '../audience-intelligence/types/audience-jtbd.types';
import type { AudiencePrioritizationResult } from '../audience-intelligence/types/audience-prioritization.types';

const EMPTY_ANALYSIS_BATCH: CompetitorWebsiteAnalysisBatchResult = {
  competitors: [],
  failures: [],
  attemptedCount: 0,
  analyzedCount: 0,
  failedCount: 0,
  analyzedAt: new Date(0),
};

/**
 * Single tenant-safe orchestration for keyword signal extraction. Runs one
 * Product lookup, one best-effort website-knowledge build, and the full
 * Sprint 9/10 pure chain (discoverCategory -> extract -> construct -> detect
 * -> map -> identify -> generate) exactly once each — never the *ForProduct()
 * orchestrators, which would redo the lookup/website work. See Sprint 9H.1 /
 * 10H for the same duplicate-work-avoidance pattern.
 */
@Injectable()
export class KeywordIntelligenceService {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productWebsiteKnowledgeService: ProductWebsiteKnowledgeService,
    private readonly marketCategoryService: MarketCategoryService,
    private readonly audienceSignalService: AudienceSignalService,
    private readonly audienceSegmentService: AudienceSegmentService,
    private readonly icpService: IcpService,
    private readonly buyerUserMapService: BuyerUserMapService,
    private readonly audiencePainPointService: AudiencePainPointService,
    private readonly audienceJtbdService: AudienceJtbdService,
    private readonly audiencePrioritizationService: AudiencePrioritizationService,
    private readonly keywordSignalService: KeywordSignalService,
    private readonly keywordIntentService: KeywordIntentService,
    private readonly keywordClusterService: KeywordClusterService,
    private readonly keywordOpportunityService: KeywordOpportunityService,
    private readonly competitorDiscoveryService: CompetitorDiscoveryService,
    private readonly competitorWebsiteAnalysisService: CompetitorWebsiteAnalysisService,
    private readonly competitorFeatureComparisonService: CompetitorFeatureComparisonService,
    private readonly competitorKeywordGapService: CompetitorKeywordGapService,
    private readonly keywordLongTailService: KeywordLongTailService,
    private readonly keywordAudienceMapService: KeywordAudienceMapService,
  ) {}

  /**
   * Runs the 11A keyword-signal orchestration exactly once, then classifies
   * the result in memory via the pure KeywordIntentService — no repeated
   * product/website/category/audience work, no internal HTTP call to
   * signals-preview.
   */
  async buildIntentsForProduct(organizationId: string, productId: string, userId: string): Promise<KeywordIntentResult> {
    const signals = await this.buildForProduct(organizationId, productId, userId);
    return this.keywordIntentService.classify(signals);
  }

  /**
   * Same single 11A pass, then 11B classify() and 11C cluster() purely in
   * memory — no internal HTTP calls, no repeated orchestration.
   */
  async buildClustersForProduct(organizationId: string, productId: string, userId: string): Promise<KeywordClusterResult> {
    const signals = await this.buildForProduct(organizationId, productId, userId);
    const intents = this.keywordIntentService.classify(signals);
    return this.keywordClusterService.cluster(signals, intents);
  }

  /**
   * Same single 11A pass, then 11B classify(), 11C cluster(), and 11D
   * score() all purely in memory — no internal HTTP calls, no repeated
   * orchestration.
   */
  async buildOpportunitiesForProduct(organizationId: string, productId: string, userId: string): Promise<KeywordOpportunityResult> {
    const signals = await this.buildForProduct(organizationId, productId, userId);
    const intents = this.keywordIntentService.classify(signals);
    const clusters = this.keywordClusterService.cluster(signals, intents);
    return this.keywordOpportunityService.score({ signals, intents, clusters });
  }

  async buildForProduct(organizationId: string, productId: string, userId: string): Promise<KeywordSignalResult> {
    const { productInput, websiteKnowledge, marketCategory } = await this.fetchOwnEvidence(organizationId, productId, userId);
    return this.buildSignalsFromEvidence(productInput, websiteKnowledge, marketCategory);
  }

  /**
   * Sprint 11E: one Product lookup, one own-website-knowledge build, one
   * market-category computation — shared by BOTH the own keyword pipeline
   * (11A-11D, entirely pure from here) AND competitor discovery/analysis
   * (Sprint 9), so neither the product lookup nor the own website fetch runs
   * twice. Competitor discovery (Tavily) and competitor website analysis are
   * each invoked exactly once; feature comparison and 11E's own analyze()
   * are pure.
   */
  async buildCompetitorGapsForProduct(organizationId: string, productId: string, userId: string): Promise<CompetitorKeywordGapResult> {
    const { product, productInput, websiteKnowledge, marketCategory } = await this.fetchOwnEvidence(organizationId, productId, userId);
    const signals = this.buildSignalsFromEvidence(productInput, websiteKnowledge, marketCategory);
    const intents = this.keywordIntentService.classify(signals);
    const clusters = this.keywordClusterService.cluster(signals, intents);
    const opportunities = this.keywordOpportunityService.score({ signals, intents, clusters });

    return this.buildCompetitorGapsFromEvidence(product, productInput, websiteKnowledge, marketCategory, signals, intents, clusters, opportunities);
  }

  /**
   * Sprint 11F: same single own-evidence build + 11A-11D pass as above.
   * Competitor gaps (11E) are optional — Tavily/the research provider may be
   * unavailable, so any failure there is swallowed and expansion proceeds
   * without competitor-gap-derived candidates rather than failing the whole
   * request with a 503.
   */
  async buildLongTailForProduct(organizationId: string, productId: string, userId: string): Promise<KeywordLongTailResult> {
    const { product, productInput, websiteKnowledge, marketCategory } = await this.fetchOwnEvidence(organizationId, productId, userId);
    const signals = this.buildSignalsFromEvidence(productInput, websiteKnowledge, marketCategory);
    const intents = this.keywordIntentService.classify(signals);
    const clusters = this.keywordClusterService.cluster(signals, intents);
    const opportunities = this.keywordOpportunityService.score({ signals, intents, clusters });

    return this.buildLongTailFromEvidence(product, productInput, websiteKnowledge, marketCategory, signals, intents, clusters, opportunities);
  }

  /**
   * Sprint 11G: one shared own-evidence build, one Sprint 10 audience-chain
   * build (including 10G prioritization, computed here since 11G needs it
   * but 11A does not) — NEVER AudienceIntelligencePreviewService.buildForProduct(),
   * which would redo the product lookup and website/category work. The 11A-11D
   * keyword chain and 11F long-tail expansion (competitor gaps optional) reuse
   * the same evidence, then 11G maps purely in memory.
   */
  async buildAudienceMapForProduct(organizationId: string, productId: string, userId: string): Promise<KeywordAudienceMapResult> {
    const { product, productInput, websiteKnowledge, marketCategory } = await this.fetchOwnEvidence(organizationId, productId, userId);
    const audienceChain = this.buildAudienceChainFromEvidence(productInput, websiteKnowledge, marketCategory);

    const signals = this.keywordSignalService.extract({
      product: productInput,
      websiteKnowledge,
      marketCategory,
      audienceSignals: audienceChain.audienceSignals,
      segments: audienceChain.segments,
      painPoints: audienceChain.painPoints,
      jtbd: audienceChain.jtbd,
    });
    const intents = this.keywordIntentService.classify(signals);
    const clusters = this.keywordClusterService.cluster(signals, intents);
    const opportunities = this.keywordOpportunityService.score({ signals, intents, clusters });
    const longTail = await this.buildLongTailFromEvidence(product, productInput, websiteKnowledge, marketCategory, signals, intents, clusters, opportunities);

    return this.keywordAudienceMapService.map({
      signals,
      intents,
      opportunities,
      longTail,
      clusters,
      audience: {
        segments: audienceChain.segments,
        icp: audienceChain.icp,
        prioritization: audienceChain.prioritization,
      },
    });
  }

  private async buildLongTailFromEvidence(
    product: Awaited<ReturnType<ProductsService['findOne']>>,
    productInput: KeywordSignalProductInput,
    websiteKnowledge: ProductWebsiteKnowledge | undefined,
    marketCategory: MarketCategoryResult,
    signals: KeywordSignalResult,
    intents: KeywordIntentResult,
    clusters: KeywordClusterResult,
    opportunities: KeywordOpportunityResult,
  ): Promise<KeywordLongTailResult> {
    let competitorGaps: CompetitorKeywordGapResult | undefined;
    try {
      competitorGaps = await this.buildCompetitorGapsFromEvidence(product, productInput, websiteKnowledge, marketCategory, signals, intents, clusters, opportunities);
    } catch {
      competitorGaps = undefined; // research provider unavailable or competitor discovery failed — expansion still proceeds
    }

    return this.keywordLongTailService.expand({ signals, intents, clusters, opportunities, competitorGaps });
  }

  private async buildCompetitorGapsFromEvidence(
    product: Awaited<ReturnType<ProductsService['findOne']>>,
    productInput: KeywordSignalProductInput,
    websiteKnowledge: ProductWebsiteKnowledge | undefined,
    marketCategory: MarketCategoryResult,
    signals: KeywordSignalResult,
    intents: KeywordIntentResult,
    clusters: KeywordClusterResult,
    opportunities: KeywordOpportunityResult,
  ): Promise<CompetitorKeywordGapResult> {
    const discovery = await this.competitorDiscoveryService.discover({
      productName: product.name,
      productWebsiteUrl: product.websiteUrl,
      marketCategory,
    });

    const ownDomain = product.websiteUrl ? extractSourceDomain(product.websiteUrl) : undefined;
    const analysisBatch =
      discovery.competitors.length > 0
        ? await this.competitorWebsiteAnalysisService.analyzeCompetitors(discovery.competitors, { excludeDomain: ownDomain })
        : EMPTY_ANALYSIS_BATCH;

    const productFeatures = websiteKnowledge?.features.length ? websiteKnowledge.features : productInput.shortDescription ? [productInput.shortDescription] : [];
    const featureComparison = this.competitorFeatureComparisonService.compare({
      productFeatures,
      competitors: analysisBatch.competitors.map((c) => ({ name: c.name, domain: c.domain, confidenceScore: c.confidenceScore, features: c.features })),
      marketCategory: marketCategory.primaryCategory,
    });

    return this.competitorKeywordGapService.analyze({
      ownSignals: signals,
      ownIntents: intents,
      ownClusters: clusters,
      ownOpportunities: opportunities,
      competitorAnalysis: analysisBatch,
      featureComparison,
    });
  }

  private async fetchOwnEvidence(
    organizationId: string,
    productId: string,
    userId: string,
  ): Promise<{
    product: Awaited<ReturnType<ProductsService['findOne']>>;
    productInput: KeywordSignalProductInput;
    websiteKnowledge?: ProductWebsiteKnowledge;
    marketCategory: MarketCategoryResult;
  }> {
    const product = await this.productsService.findOne(organizationId, productId, userId);

    let websiteKnowledge: ProductWebsiteKnowledge | undefined;
    const websiteUrl = product.websiteUrl?.trim();
    if (websiteUrl) {
      try {
        websiteKnowledge = await this.productWebsiteKnowledgeService.buildKnowledge(websiteUrl);
      } catch {
        // fall through — metadata-only fallback remains valid
      }
    }

    const productInput: KeywordSignalProductInput = {
      name: product.name,
      shortDescription: product.shortDescription,
      productType: product.productType,
      primaryGoal: product.primaryGoal,
      targetMarkets: product.targetMarkets,
    };

    const marketCategory = this.marketCategoryService.discoverCategory({ product: productInput, websiteKnowledge });

    return { product, productInput, websiteKnowledge, marketCategory };
  }

  private buildSignalsFromEvidence(
    productInput: KeywordSignalProductInput,
    websiteKnowledge: ProductWebsiteKnowledge | undefined,
    marketCategory: MarketCategoryResult,
  ): KeywordSignalResult {
    const { audienceSignals, segments, painPoints, jtbd } = this.buildAudienceChainFromEvidence(productInput, websiteKnowledge, marketCategory);

    const extractionInput: KeywordSignalExtractionInput = {
      product: productInput,
      websiteKnowledge,
      marketCategory,
      audienceSignals,
      segments,
      painPoints,
      jtbd,
    };
    return this.keywordSignalService.extract(extractionInput);
  }

  private buildAudienceChainFromEvidence(
    productInput: KeywordSignalProductInput,
    websiteKnowledge: ProductWebsiteKnowledge | undefined,
    marketCategory: MarketCategoryResult,
  ): {
    audienceSignals: AudienceSignalResult;
    segments: AudienceSegmentResult;
    icp: IcpResult;
    buyerUserMap: BuyerUserMapResult;
    painPoints: AudiencePainPointResult;
    jtbd: AudienceJtbdResult;
    prioritization: AudiencePrioritizationResult;
  } {
    const audienceSignals = this.audienceSignalService.extract({ product: productInput, websiteKnowledge, marketCategory });
    const segments = this.audienceSegmentService.construct(audienceSignals);
    const icp = this.icpService.detect({ signals: audienceSignals, segments });
    const buyerUserMap = this.buyerUserMapService.map({ signals: audienceSignals, segments, icp });
    const painPoints = this.audiencePainPointService.identify({ signals: audienceSignals, segments, icp, buyerUserMap });
    const jtbd = this.audienceJtbdService.generate({ signals: audienceSignals, segments, icp, buyerUserMap, painPoints });
    const prioritization = this.audiencePrioritizationService.prioritize({ signals: audienceSignals, segments, icp, buyerUserMap, painPoints, jtbd });

    return { audienceSignals, segments, icp, buyerUserMap, painPoints, jtbd, prioritization };
  }
}
