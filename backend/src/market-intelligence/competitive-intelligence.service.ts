import { Injectable } from '@nestjs/common';
import { ProductsService } from '../products/products.service';
import { ProductWebsiteKnowledgeService } from '../website-intelligence/product-website-knowledge.service';
import { CompetitorFeatureComparisonService } from './competitor-feature-comparison.service';
import { CompetitorPositioningService } from './competitor-positioning.service';
import { CompetitorWebsiteAnalysisService } from './competitor-website-analysis.service';
import { MarketCategoryService } from './market-category.service';
import { MarketGapService } from './market-gap.service';
import type { PositioningEntityEvidence } from './types/competitor-positioning.types';
import type { CompetitiveIntelligencePreview } from './types/competitive-intelligence.types';

/**
 * Single consolidated orchestration for the entire Sprint 9 pipeline.
 * Competitor discovery + competitor website analysis (the only
 * Tavily/network-cost steps) run exactly once here; feature comparison,
 * positioning, and market-gap analysis are all pure computations derived
 * from that single result — no repeated discovery, no repeated fetching.
 */
@Injectable()
export class CompetitiveIntelligenceService {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productWebsiteKnowledgeService: ProductWebsiteKnowledgeService,
    private readonly marketCategoryService: MarketCategoryService,
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
    if (websiteUrl) {
      try {
        const knowledge = await this.productWebsiteKnowledgeService.buildKnowledge(websiteUrl);
        productFeatures = knowledge.features;
        productEvidence = {
          title: knowledge.identity.title,
          metaDescription: knowledge.identity.metaDescription,
          keyStatements: knowledge.identity.keyStatements,
          features: knowledge.features,
          pricingSignals: knowledge.pricing.signals,
          callsToAction: knowledge.callsToAction,
          documentationTopics: knowledge.documentation.topics,
          technicalFacts: knowledge.documentation.technicalFacts,
        };
      } catch {
        // fall through to metadata fallback below
      }
    }
    if (productFeatures.length === 0 && product.shortDescription?.trim()) {
      productFeatures = [product.shortDescription.trim()];
      productEvidence = { ...productEvidence, keyStatements: [product.shortDescription.trim()] };
    }

    const marketCategory = await this.marketCategoryService.discoverForProduct(organizationId, productId, userId);

    // The one and only Tavily + competitor-website-fetch pass for this request.
    const analysis = await this.competitorWebsiteAnalysisService.analyzeForProduct(organizationId, productId, userId);

    const competitorFeatureInputs = analysis.analyzedCompetitors.map((c) => ({
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

    const positioningCompetitorInputs = analysis.analyzedCompetitors.map((c) => ({
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
    marketGaps.stats.discoveredCompetitors = analysis.discoveredCompetitors;
    marketGaps.stats.analyzedCompetitors = analysis.stats.analyzed;

    const warnings = Array.from(
      new Set([...marketCategory.warnings, ...analysis.warnings, ...featureComparison.warnings, ...positioning.warnings, ...marketGaps.warnings]),
    );

    return {
      marketCategory,
      discovery: {
        discoveredCompetitors: analysis.discoveredCompetitors,
        warnings: analysis.warnings,
      },
      competitorAnalysis: {
        competitors: analysis.analyzedCompetitors,
        failures: analysis.analysisFailures,
      },
      featureComparison,
      positioning,
      marketGaps,
      stats: {
        discoveredCompetitors: analysis.discoveredCompetitors,
        analyzedCompetitors: analysis.stats.analyzed,
        failedCompetitorAnalyses: analysis.stats.failed,
        productFeatureCount: featureComparison.stats.productFeatureCount,
        totalOpportunities: marketGaps.stats.totalOpportunities,
      },
      warnings,
      generatedAt: new Date(),
    };
  }
}
