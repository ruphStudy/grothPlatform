import { Injectable } from '@nestjs/common';
import { AudienceJtbdService } from '../audience-intelligence/audience-jtbd.service';
import { AudiencePainPointService } from '../audience-intelligence/audience-pain-point.service';
import { AudiencePrioritizationService } from '../audience-intelligence/audience-prioritization.service';
import { AudienceSegmentService } from '../audience-intelligence/audience-segment.service';
import { AudienceSignalService } from '../audience-intelligence/audience-signal.service';
import { BuyerUserMapService } from '../audience-intelligence/buyer-user-map.service';
import { IcpService } from '../audience-intelligence/icp.service';
import { CompetitorKeywordGapService } from '../keyword-intelligence/competitor-keyword-gap.service';
import { KeywordAudienceMapService } from '../keyword-intelligence/keyword-audience-map.service';
import { KeywordClusterService } from '../keyword-intelligence/keyword-cluster.service';
import { KeywordIntentService } from '../keyword-intelligence/keyword-intent.service';
import { KeywordLongTailService } from '../keyword-intelligence/keyword-long-tail.service';
import { KeywordOpportunityService } from '../keyword-intelligence/keyword-opportunity.service';
import { KeywordSignalService } from '../keyword-intelligence/keyword-signal.service';
import { CompetitorDiscoveryService } from '../market-intelligence/competitor-discovery.service';
import { CompetitorFeatureComparisonService } from '../market-intelligence/competitor-feature-comparison.service';
import { CompetitorPositioningService } from '../market-intelligence/competitor-positioning.service';
import { CompetitorWebsiteAnalysisService } from '../market-intelligence/competitor-website-analysis.service';
import { MarketCategoryService } from '../market-intelligence/market-category.service';
import { MarketGapService } from '../market-intelligence/market-gap.service';
import type { CompetitorFeatureComparisonResult } from '../market-intelligence/types/competitor-feature-comparison.types';
import type { CompetitorPositioningAnalysisResult } from '../market-intelligence/types/competitor-positioning.types';
import type { CompetitorWebsiteAnalysisBatchResult } from '../market-intelligence/types/competitor-analysis.types';
import type { MarketGapAnalysisResult } from '../market-intelligence/types/market-gap.types';
import { ProductsService } from '../products/products.service';
import { extractSourceDomain } from '../research/research-url.util';
import { ProductWebsiteKnowledgeService } from '../website-intelligence/product-website-knowledge.service';
import type { ProductWebsiteKnowledge } from '../website-intelligence/product-website-knowledge.types';
import { ContentStrategyService } from './content-strategy.service';
import { FunnelStrategyService } from './funnel-strategy.service';
import { GrowthChannelFitService } from './growth-channel-fit.service';
import { GrowthMotionService } from './growth-motion.service';
import { GrowthObjectiveService } from './growth-objective.service';
import { MessagingStrategyService } from './messaging-strategy.service';
import { StrategySignalService } from './strategy-signal.service';
import type { ContentStrategyResult } from './types/content-strategy.types';
import type { FunnelStrategyResult } from './types/funnel-strategy.types';
import type { GrowthChannelFitResult } from './types/growth-channel-fit.types';
import type { GrowthMotionResult } from './types/growth-motion.types';
import type { GrowthObjectiveResult } from './types/growth-objective.types';
import type { GrowthStrategyOverview } from './types/growth-strategy-overview.types';
import type { MessagingStrategyResult } from './types/messaging-strategy.types';
import type { StrategySignalResult } from './types/strategy-signal.types';
import type { CompetitorKeywordGapResult } from '../keyword-intelligence/types/competitor-keyword-gap.types';

const EMPTY_ANALYSIS_BATCH: CompetitorWebsiteAnalysisBatchResult = {
  competitors: [],
  failures: [],
  attemptedCount: 0,
  analyzedCount: 0,
  failedCount: 0,
  analyzedAt: new Date(0),
};

/**
 * Single tenant-safe orchestration for Sprint 12A. One Product lookup, one
 * best-effort own-website-knowledge build, one market-category computation —
 * shared by the full Sprint 10 audience chain, the Sprint 11A-11D keyword
 * chain, AND Sprint 9's competitor pipeline (discovery + website analysis
 * run at most once total and are reused for feature comparison, positioning,
 * market gaps, AND the 11E keyword-gap result — never a second discovery
 * pass). If the research provider is unavailable, all competitor-derived
 * inputs are simply omitted; the rest of the pipeline still succeeds.
 */
@Injectable()
export class GrowthStrategyService {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productWebsiteKnowledgeService: ProductWebsiteKnowledgeService,
    private readonly marketCategoryService: MarketCategoryService,
    private readonly competitorDiscoveryService: CompetitorDiscoveryService,
    private readonly competitorWebsiteAnalysisService: CompetitorWebsiteAnalysisService,
    private readonly competitorFeatureComparisonService: CompetitorFeatureComparisonService,
    private readonly competitorPositioningService: CompetitorPositioningService,
    private readonly marketGapService: MarketGapService,
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
    private readonly keywordLongTailService: KeywordLongTailService,
    private readonly keywordAudienceMapService: KeywordAudienceMapService,
    private readonly competitorKeywordGapService: CompetitorKeywordGapService,
    private readonly strategySignalService: StrategySignalService,
    private readonly growthObjectiveService: GrowthObjectiveService,
    private readonly growthChannelFitService: GrowthChannelFitService,
    private readonly growthMotionService: GrowthMotionService,
    private readonly funnelStrategyService: FunnelStrategyService,
    private readonly messagingStrategyService: MessagingStrategyService,
    private readonly contentStrategyService: ContentStrategyService,
  ) {}

  /**
   * Sprint 12B: reuses the exact same single 12A orchestration pass above —
   * no duplicate product/website/category/audience/keyword/competitor work —
   * then detects growth objectives purely in memory.
   */
  async buildObjectivesForProduct(organizationId: string, productId: string, userId: string): Promise<GrowthObjectiveResult> {
    const strategySignals = await this.buildSignalsForProduct(organizationId, productId, userId);
    return this.growthObjectiveService.detect(strategySignals);
  }

  /**
   * Sprint 12C: same single 12A pass, then 12B detect() and 12C evaluate()
   * both purely in memory — no internal HTTP call to objectives-preview, no
   * repeated orchestration.
   */
  async buildChannelsForProduct(organizationId: string, productId: string, userId: string): Promise<GrowthChannelFitResult> {
    const signals = await this.buildSignalsForProduct(organizationId, productId, userId);
    const objectives = this.growthObjectiveService.detect(signals);
    return this.growthChannelFitService.evaluate({ signals, objectives });
  }

  /**
   * Sprint 12D: same single 12A pass, then 12B detect(), 12C evaluate(), and
   * 12D detect() all purely in memory — no internal HTTP calls, no repeated
   * orchestration.
   */
  async buildMotionsForProduct(organizationId: string, productId: string, userId: string): Promise<GrowthMotionResult> {
    const signals = await this.buildSignalsForProduct(organizationId, productId, userId);
    const objectives = this.growthObjectiveService.detect(signals);
    const channels = this.growthChannelFitService.evaluate({ signals, objectives });
    return this.growthMotionService.detect({ signals, objectives, channels });
  }

  /**
   * Funnel Strategy: same single 12A pass, then objective detection and
   * channel-fit evaluation (both pure) feed the pure funnel build — no
   * internal HTTP calls to earlier preview endpoints, no repeated
   * orchestration.
   */
  async buildFunnelForProduct(organizationId: string, productId: string, userId: string): Promise<FunnelStrategyResult> {
    const signals = await this.buildSignalsForProduct(organizationId, productId, userId);
    const objectives = this.growthObjectiveService.detect(signals);
    const channels = this.growthChannelFitService.evaluate({ signals, objectives });
    return this.funnelStrategyService.build({ signals, objectives, channels });
  }

  /**
   * Sprint 12 UI Catch-up: a single consolidated read for the Growth
   * Strategy UI card. One 12A pass, then 12B/12C/funnel all pure — avoids
   * the frontend having to call four separate preview endpoints, each of
   * which would independently rebuild the full 12A pipeline (product
   * lookup, website knowledge, category, Sprint 10 audience chain, Sprint
   * 11 keyword chain, and the optional Sprint 9 competitor pass).
   */
  async buildOverviewForProduct(organizationId: string, productId: string, userId: string): Promise<GrowthStrategyOverview> {
    const signals = await this.buildSignalsForProduct(organizationId, productId, userId);
    const objectives = this.growthObjectiveService.detect(signals);
    const channels = this.growthChannelFitService.evaluate({ signals, objectives });
    const funnel = this.funnelStrategyService.build({ signals, objectives, channels });
    const messaging = this.messagingStrategyService.build({ signals, objectives, channels, funnel });
    const contentStrategy = this.contentStrategyService.build({ signals, objectives, channels, funnel, messaging });

    return { signals, objectives, channels, funnel, messaging, contentStrategy, generatedAt: new Date() };
  }

  /**
   * Sprint 12D: reuses the same single 12A pass and the same pure 12B/12C/
   * funnel chain as overview-preview — no repeated orchestration, no
   * internal HTTP calls.
   */
  async buildMessagingForProduct(organizationId: string, productId: string, userId: string): Promise<MessagingStrategyResult> {
    const signals = await this.buildSignalsForProduct(organizationId, productId, userId);
    const objectives = this.growthObjectiveService.detect(signals);
    const channels = this.growthChannelFitService.evaluate({ signals, objectives });
    const funnel = this.funnelStrategyService.build({ signals, objectives, channels });
    return this.messagingStrategyService.build({ signals, objectives, channels, funnel });
  }

  /**
   * Sprint 12E: same single 12A pass, then 12B/12C/funnel/messaging (all
   * pure) feed the pure content-strategy build — no internal HTTP calls, no
   * repeated orchestration.
   */
  async buildContentForProduct(organizationId: string, productId: string, userId: string): Promise<ContentStrategyResult> {
    const signals = await this.buildSignalsForProduct(organizationId, productId, userId);
    const objectives = this.growthObjectiveService.detect(signals);
    const channels = this.growthChannelFitService.evaluate({ signals, objectives });
    const funnel = this.funnelStrategyService.build({ signals, objectives, channels });
    const messaging = this.messagingStrategyService.build({ signals, objectives, channels, funnel });
    return this.contentStrategyService.build({ signals, objectives, channels, funnel, messaging });
  }

  async buildSignalsForProduct(organizationId: string, productId: string, userId: string): Promise<StrategySignalResult> {
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

    const productInput = {
      name: product.name,
      shortDescription: product.shortDescription,
      productType: product.productType,
      primaryGoal: product.primaryGoal,
      targetMarkets: product.targetMarkets,
    };

    const marketCategory = this.marketCategoryService.discoverCategory({ product: productInput, websiteKnowledge });

    // Sprint 10 audience chain (pure).
    const audienceSignals = this.audienceSignalService.extract({ product: productInput, websiteKnowledge, marketCategory });
    const segments = this.audienceSegmentService.construct(audienceSignals);
    const icp = this.icpService.detect({ signals: audienceSignals, segments });
    const buyerUserMap = this.buyerUserMapService.map({ signals: audienceSignals, segments, icp });
    const painPoints = this.audiencePainPointService.identify({ signals: audienceSignals, segments, icp, buyerUserMap });
    const jtbd = this.audienceJtbdService.generate({ signals: audienceSignals, segments, icp, buyerUserMap, painPoints });
    const prioritization = this.audiencePrioritizationService.prioritize({ signals: audienceSignals, segments, icp, buyerUserMap, painPoints, jtbd });

    // Sprint 11A-11D keyword chain (pure).
    const keywordSignals = this.keywordSignalService.extract({
      product: productInput,
      websiteKnowledge,
      marketCategory,
      audienceSignals,
      segments,
      painPoints,
      jtbd,
    });
    const keywordIntents = this.keywordIntentService.classify(keywordSignals);
    const keywordClusters = this.keywordClusterService.cluster(keywordSignals, keywordIntents);
    const keywordOpportunities = this.keywordOpportunityService.score({ signals: keywordSignals, intents: keywordIntents, clusters: keywordClusters });

    // Sprint 9 competitor pipeline — discovery + website analysis at most
    // once, reused for feature comparison, positioning, market gaps, and
    // the 11E keyword-gap result. Optional: a missing/unavailable research
    // provider degrades gracefully rather than failing the whole request.
    let featureComparison: CompetitorFeatureComparisonResult | undefined;
    let positioning: CompetitorPositioningAnalysisResult | undefined;
    let marketGaps: MarketGapAnalysisResult | undefined;
    let competitorKeywordGaps: CompetitorKeywordGapResult | undefined;
    try {
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
      featureComparison = this.competitorFeatureComparisonService.compare({
        productFeatures,
        competitors: analysisBatch.competitors.map((c) => ({ name: c.name, domain: c.domain, confidenceScore: c.confidenceScore, features: c.features })),
        marketCategory: marketCategory.primaryCategory,
      });

      const productEvidence = {
        title: websiteKnowledge?.identity.title,
        metaDescription: websiteKnowledge?.identity.metaDescription,
        keyStatements: websiteKnowledge?.identity.keyStatements ?? [],
        features: productFeatures,
        pricingSignals: websiteKnowledge?.pricing.signals ?? [],
        callsToAction: websiteKnowledge?.callsToAction ?? [],
        documentationTopics: websiteKnowledge?.documentation.topics ?? [],
        technicalFacts: websiteKnowledge?.documentation.technicalFacts ?? [],
      };
      const positioningCompetitorInputs = analysisBatch.competitors.map((c) => ({
        name: c.name,
        domain: c.domain,
        confidenceScore: c.confidenceScore,
        title: c.title,
        metaDescription: c.metaDescription,
        keyStatements: c.keyStatements,
        features: c.features,
        pricingSignals: c.pricingSignals,
        callsToAction: c.callsToAction,
        documentationTopics: c.documentation.topics,
        technicalFacts: c.documentation.technicalFacts,
      }));
      positioning = this.competitorPositioningService.analyze({
        product: productEvidence,
        competitors: positioningCompetitorInputs,
        marketCategory: marketCategory.primaryCategory,
        marketDescriptors: marketCategory.descriptors,
        featureComparison: {
          productDifferentiators: featureComparison.productDifferentiators,
          possibleFeatureGaps: featureComparison.possibleFeatureGaps,
          commonCapabilities: featureComparison.commonCapabilities,
        },
      });

      marketGaps = this.marketGapService.analyze({ marketCategory, featureComparison, positioning });

      competitorKeywordGaps = this.competitorKeywordGapService.analyze({
        ownSignals: keywordSignals,
        ownIntents: keywordIntents,
        ownClusters: keywordClusters,
        ownOpportunities: keywordOpportunities,
        competitorAnalysis: analysisBatch,
        featureComparison,
      });
    } catch {
      featureComparison = undefined;
      positioning = undefined;
      marketGaps = undefined;
      competitorKeywordGaps = undefined; // research provider unavailable — rest of the pipeline still succeeds
    }

    const keywordLongTail = this.keywordLongTailService.expand({
      signals: keywordSignals,
      intents: keywordIntents,
      clusters: keywordClusters,
      opportunities: keywordOpportunities,
      competitorGaps: competitorKeywordGaps,
    });
    const keywordAudienceMap = this.keywordAudienceMapService.map({
      signals: keywordSignals,
      intents: keywordIntents,
      opportunities: keywordOpportunities,
      longTail: keywordLongTail,
      clusters: keywordClusters,
      audience: { segments, icp, prioritization },
    });

    return this.strategySignalService.extract({
      product: productInput,
      marketCategory,
      featureComparison,
      positioning,
      marketGaps,
      audienceSignals,
      segments,
      icp,
      buyerUserMap,
      painPoints,
      jtbd,
      prioritization,
      keywordSignals,
      keywordClusters,
      keywordOpportunities,
      keywordLongTail,
      keywordAudienceMap,
      competitorKeywordGaps,
    });
  }
}
