import { Injectable } from '@nestjs/common';
import { ProductsService } from '../products/products.service';
import { extractSourceDomain } from '../research/research-url.util';
import { ProductWebsiteKnowledgeService } from '../website-intelligence/product-website-knowledge.service';
import { CompetitorDiscoveryService } from './competitor-discovery.service';
import { CompetitorFeatureComparisonService } from './competitor-feature-comparison.service';
import { CompetitorPositioningService } from './competitor-positioning.service';
import { CompetitorWebsiteAnalysisService } from './competitor-website-analysis.service';
import { MarketCategoryService } from './market-category.service';
import { MarketGapService } from './market-gap.service';
import type { PositioningEntityEvidence } from './types/competitor-positioning.types';
import type { CompetitorWebsiteAnalysisBatchResult } from './types/competitor-analysis.types';
import type { CompetitiveIntelligencePreview } from './types/competitive-intelligence.types';

const EMPTY_ANALYSIS_BATCH: CompetitorWebsiteAnalysisBatchResult = {
  competitors: [],
  failures: [],
  attemptedCount: 0,
  analyzedCount: 0,
  failedCount: 0,
  analyzedAt: new Date(0),
};

/**
 * Single consolidated orchestration for the entire Sprint 9 pipeline.
 * Product lookup, website-knowledge build, and market-category discovery
 * each run exactly once here — this deliberately calls the lower-level
 * pure/data methods (discoverCategory, discover, analyzeCompetitors)
 * instead of the *ForProduct() convenience wrappers, since those wrappers
 * each redo the product lookup and category discovery internally. Only
 * competitor discovery + competitor website analysis touch the network
 * (Tavily / competitor sites), and each runs exactly once per request.
 */
@Injectable()
export class CompetitiveIntelligenceService {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productWebsiteKnowledgeService: ProductWebsiteKnowledgeService,
    private readonly marketCategoryService: MarketCategoryService,
    private readonly competitorDiscoveryService: CompetitorDiscoveryService,
    private readonly competitorWebsiteAnalysisService: CompetitorWebsiteAnalysisService,
    private readonly competitorFeatureComparisonService: CompetitorFeatureComparisonService,
    private readonly competitorPositioningService: CompetitorPositioningService,
    private readonly marketGapService: MarketGapService,
  ) {}

  async buildForProduct(organizationId: string, productId: string, userId: string): Promise<CompetitiveIntelligencePreview> {
    const product = await this.productsService.findOne(organizationId, productId, userId);

    let productFeatures: string[] = [];
    let productEvidence: PositioningEntityEvidence = {
      keyStatements: [],
      features: [],
      pricingSignals: [],
      callsToAction: [],
      documentationTopics: [],
      technicalFacts: [],
    };
    const websiteUrl = product.websiteUrl?.trim();
    let websiteKnowledge: Awaited<ReturnType<ProductWebsiteKnowledgeService['buildKnowledge']>> | undefined;
    if (websiteUrl) {
      try {
        websiteKnowledge = await this.productWebsiteKnowledgeService.buildKnowledge(websiteUrl);
        productFeatures = websiteKnowledge.features;
        productEvidence = {
          title: websiteKnowledge.identity.title,
          metaDescription: websiteKnowledge.identity.metaDescription,
          keyStatements: websiteKnowledge.identity.keyStatements,
          features: websiteKnowledge.features,
          pricingSignals: websiteKnowledge.pricing.signals,
          callsToAction: websiteKnowledge.callsToAction,
          documentationTopics: websiteKnowledge.documentation.topics,
          technicalFacts: websiteKnowledge.documentation.technicalFacts,
        };
      } catch {
        // fall through to metadata fallback below — website knowledge stays optional
      }
    }
    if (productFeatures.length === 0 && product.shortDescription?.trim()) {
      productFeatures = [product.shortDescription.trim()];
      productEvidence = { ...productEvidence, keyStatements: [product.shortDescription.trim()] };
    }

    const marketCategory = this.marketCategoryService.discoverCategory({
      product: {
        name: product.name,
        shortDescription: product.shortDescription,
        productType: product.productType,
        primaryGoal: product.primaryGoal,
        targetMarkets: product.targetMarkets,
      },
      websiteKnowledge,
    });

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

    const competitorFeatureInputs = analysisBatch.competitors.map((c) => ({
      name: c.name,
      domain: c.domain,
      confidenceScore: c.confidenceScore,
      features: c.features,
    }));
    const featureComparison = this.competitorFeatureComparisonService.compare({
      productFeatures,
      competitors: competitorFeatureInputs,
      marketCategory: marketCategory.primaryCategory,
    });

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
    const positioning = this.competitorPositioningService.analyze({
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

    const marketGaps = this.marketGapService.analyze({ marketCategory, featureComparison, positioning });
    marketGaps.stats.discoveredCompetitors = discovery.competitors.length;
    marketGaps.stats.analyzedCompetitors = analysisBatch.analyzedCount;

    const warnings = Array.from(
      new Set([...marketCategory.warnings, ...discovery.warnings, ...featureComparison.warnings, ...positioning.warnings, ...marketGaps.warnings]),
    );

    return {
      marketCategory,
      discovery: {
        discoveredCompetitors: discovery.competitors.length,
        warnings: discovery.warnings,
      },
      competitorAnalysis: {
        competitors: analysisBatch.competitors,
        failures: analysisBatch.failures,
      },
      featureComparison,
      positioning,
      marketGaps,
      stats: {
        discoveredCompetitors: discovery.competitors.length,
        analyzedCompetitors: analysisBatch.analyzedCount,
        failedCompetitorAnalyses: analysisBatch.failedCount,
        productFeatureCount: featureComparison.stats.productFeatureCount,
        totalOpportunities: marketGaps.stats.totalOpportunities,
      },
      warnings,
      generatedAt: new Date(),
    };
  }
}
