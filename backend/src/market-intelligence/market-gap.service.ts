import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductsService } from '../products/products.service';
import { ProductWebsiteKnowledgeService } from '../website-intelligence/product-website-knowledge.service';
import { CompetitorFeatureComparisonService } from './competitor-feature-comparison.service';
import { CompetitorPositioningService } from './competitor-positioning.service';
import { CompetitorWebsiteAnalysisService } from './competitor-website-analysis.service';
import { MarketCategoryService } from './market-category.service';
import type { PositioningEntityEvidence } from './types/competitor-positioning.types';
import type {
  CommonMarketPattern,
  MarketGapAnalysisInput,
  MarketGapAnalysisResult,
  MarketGapCategory,
  MarketGapEvidence,
  MarketGapOpportunity,
  MarketGapOpportunityType,
} from './types/market-gap.types';

const DEFAULT_MAX_OPPORTUNITIES = 12;
const DEFAULT_MAX_STRONGEST = 5;
const DEFAULT_MAX_COMPETITORS = 5;

const AUDIENCE_MIN_SUPPORT_RATIO = 0.5;
const PATTERN_MIN_SUPPORT_RATIO = 0.5;
const MIN_COMPETITORS_FOR_PATTERN = 2;

const HYPOTHESIS_WARNING = 'Opportunities are hypotheses and should be validated with customer/research data.';
const EVIDENCE_SCOPE_WARNING = 'Market-gap analysis is based only on publicly visible competitor website evidence.';

interface DraftOpportunity {
  category: MarketGapCategory;
  title: string;
  description: string;
  opportunityType: MarketGapOpportunityType;
  evidence: MarketGapEvidence[];
  priorityScore: number;
  confidenceScore: number;
  caution: string;
}

@Injectable()
export class MarketGapService {
  constructor(
    private readonly configService: ConfigService,
    private readonly productsService: ProductsService,
    private readonly productWebsiteKnowledgeService: ProductWebsiteKnowledgeService,
    private readonly marketCategoryService: MarketCategoryService,
    private readonly competitorWebsiteAnalysisService: CompetitorWebsiteAnalysisService,
    private readonly competitorFeatureComparisonService: CompetitorFeatureComparisonService,
    private readonly competitorPositioningService: CompetitorPositioningService,
  ) {}

  /**
   * Product-scoped orchestration. Tenant lookup happens first. Competitor
   * discovery + website analysis run exactly once (via the existing
   * CompetitorWebsiteAnalysisService); feature comparison and positioning
   * analysis are computed once here via their pure methods so this sprint's
   * gap detection can see all three upstream results without re-fetching.
   */
  async analyzeForProduct(organizationId: string, productId: string, userId: string): Promise<MarketGapAnalysisResult> {
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

    const result = this.analyze({ marketCategory, featureComparison, positioning });

    if (analysis.analysisFailures.length > 0) {
      result.warnings = this.dedupe([...result.warnings, 'Market-gap analysis is based on partial competitor coverage.']);
    }
    result.stats.discoveredCompetitors = analysis.discoveredCompetitors;
    result.stats.analyzedCompetitors = analysis.stats.analyzed;

    return result;
  }

  analyze(input: MarketGapAnalysisInput): MarketGapAnalysisResult {
    const { marketCategory, featureComparison, positioning } = input;
    const competitors = positioning.competitorPositioning.slice(0, this.getMaxCompetitors());
    const totalCompetitors = competitors.length;

    const productThemes = new Set(positioning.productPositioning.valueThemes.map((t) => t.toLowerCase()));
    const differentiatorSet = new Set(featureComparison.productDifferentiators.map((d) => d.toLowerCase()));
    const commonCapabilitySet = new Set(featureComparison.commonCapabilities.map((c) => c.toLowerCase()));

    const drafts: DraftOpportunity[] = [
      ...this.buildCapabilityGapOpportunities(featureComparison, totalCompetitors),
      ...this.buildDifferentiationOpportunities(featureComparison, positioning, totalCompetitors),
      ...this.buildPositioningOpportunities(positioning, totalCompetitors, productThemes, differentiatorSet, commonCapabilitySet),
      ...this.buildAudienceOpportunities(positioning, competitors, totalCompetitors),
      ...this.buildPricingOpportunities(positioning, competitors, totalCompetitors),
      ...this.buildGoToMarketOpportunities(positioning, competitors, totalCompetitors),
    ];

    const combos = this.buildCombinationOpportunities(drafts, positioning);
    drafts.push(...combos);

    const dedupedDrafts = this.dedupeDrafts(drafts);
    const sorted = dedupedDrafts.sort((a, b) => b.priorityScore - a.priorityScore || b.confidenceScore - a.confidenceScore);

    const opportunities: MarketGapOpportunity[] = sorted.slice(0, this.getMaxOpportunities()).map((d, i) => ({
      id: `${d.opportunityType}-${i + 1}`,
      category: d.category,
      title: d.title,
      description: d.description,
      opportunityType: d.opportunityType,
      priorityScore: d.priorityScore,
      confidenceScore: d.confidenceScore,
      evidence: d.evidence,
      caution: d.caution,
    }));
    const strongestOpportunities = opportunities.slice(0, this.getMaxStrongest());

    const commonMarketPatterns = this.buildCommonMarketPatterns(positioning, totalCompetitors);

    const confidenceScore = this.computeOverallConfidence(featureComparison, positioning, marketCategory, totalCompetitors);
    const warnings = this.buildWarnings(featureComparison, positioning, marketCategory, totalCompetitors);

    return {
      marketCategory: marketCategory.primaryCategory,
      opportunities,
      strongestOpportunities,
      commonMarketPatterns,
      confidenceScore,
      warnings,
      stats: {
        discoveredCompetitors: totalCompetitors,
        analyzedCompetitors: totalCompetitors,
        competitorsUsed: totalCompetitors,
        featureGapCount: featureComparison.possibleFeatureGaps.length,
        positioningOpportunityCount: positioning.opportunities.length,
        totalOpportunities: opportunities.length,
      },
      analyzedAt: new Date(),
    };
  }

  // --- capability gaps (9E possibleFeatureGaps, no relexing) ---

  private buildCapabilityGapOpportunities(
    featureComparison: MarketGapAnalysisInput['featureComparison'],
    totalCompetitors: number,
  ): DraftOpportunity[] {
    return featureComparison.possibleFeatureGaps.map((gap) => {
      const { priorityScore, confidenceScore } = this.scoreFromSupport(
        gap.competitorCount,
        Math.max(totalCompetitors, gap.competitorCount),
        featureComparison.confidenceScore,
      );
      return {
        category: 'capability',
        opportunityType: 'possible_product_gap',
        title: `Possible market gap: ${gap.capability}`,
        description: `Public competitor evidence suggests "${gap.capability}" appears across ${gap.competitorCount} analyzed competitor(s) and was not detected in current product feature evidence.`,
        evidence: [
          { type: 'feature_gap', description: gap.capability, competitors: gap.competitors, supportingCount: gap.competitorCount },
        ],
        priorityScore,
        confidenceScore,
        caution: 'This does not confirm the product lacks this capability — it reflects an absence in extracted public evidence only.',
      };
    });
  }

  // --- differentiation opportunities (9E productDifferentiators, optionally corroborated by 9F messaging gap) ---

  private buildDifferentiationOpportunities(
    featureComparison: MarketGapAnalysisInput['featureComparison'],
    positioning: MarketGapAnalysisInput['positioning'],
    totalCompetitors: number,
  ): DraftOpportunity[] {
    const messagingGapThemes = new Set(
      positioning.opportunities
        .filter((o) => featureComparison.productDifferentiators.some((d) => d.toLowerCase() === o.theme.toLowerCase()))
        .map((o) => o.theme.toLowerCase()),
    );

    return featureComparison.productDifferentiators.map((differentiator) => {
      const weakMessaging = messagingGapThemes.has(differentiator.toLowerCase());
      const { priorityScore, confidenceScore } = this.scoreFromSupport(
        totalCompetitors,
        Math.max(totalCompetitors, 1),
        featureComparison.confidenceScore,
      );
      const boostedPriority = this.clamp(priorityScore + (weakMessaging ? 20 : 0), 0, 100);

      return {
        category: 'differentiation',
        opportunityType: 'differentiation_opportunity',
        title: `Potential differentiation opportunity: ${differentiator}`,
        description: weakMessaging
          ? `"${differentiator}" appears unmatched among analyzed competitors, and current product positioning statements do not clearly emphasize it. Consider whether messaging could better reflect this capability.`
          : `"${differentiator}" appears unmatched among ${totalCompetitors} analyzed competitor(s). This may represent a differentiation opportunity.`,
        evidence: [
          { type: 'product_differentiator', description: differentiator, competitors: [], supportingCount: totalCompetitors },
        ],
        priorityScore: boostedPriority,
        confidenceScore,
        caution: 'Potential differentiation opportunity based on public feature comparison; validate against real customer priorities before emphasizing in messaging.',
      };
    });
  }

  // --- positioning gaps / underused-product-theme signals (9F opportunities, bucketed) ---

  private buildPositioningOpportunities(
    positioning: MarketGapAnalysisInput['positioning'],
    totalCompetitors: number,
    productThemes: Set<string>,
    differentiatorSet: Set<string>,
    commonCapabilitySet: Set<string>,
  ): DraftOpportunity[] {
    const drafts: DraftOpportunity[] = [];

    for (const po of positioning.opportunities) {
      const themeKey = po.theme.toLowerCase();
      if (differentiatorSet.has(themeKey)) continue; // handled as a differentiation/messaging opportunity above

      const { priorityScore, confidenceScore } = this.scoreFromSupport(
        po.supportingCompetitors.length,
        Math.max(totalCompetitors, 1),
        po.confidenceScore,
      );

      if (productThemes.has(themeKey)) {
        drafts.push({
          category: 'differentiation',
          opportunityType: 'differentiation_opportunity',
          title: `Potential differentiation opportunity: ${po.theme}`,
          description: `The product emphasizes "${po.theme}" in its public messaging, and this theme appeared in few or none of the analyzed competitors' messaging.`,
          evidence: [{ type: 'underused_market_theme', description: po.theme, competitors: po.supportingCompetitors, supportingCount: po.supportingCompetitors.length }],
          priorityScore,
          confidenceScore,
          caution: 'Reflects public messaging only; competitors may still offer this capability without emphasizing it.',
        });
        continue;
      }

      const capabilityLikelyExists = commonCapabilitySet.has(themeKey);
      drafts.push({
        category: 'positioning',
        opportunityType: 'positioning_gap',
        title: `Possible positioning gap: ${po.theme}`,
        description: capabilityLikelyExists
          ? `This theme appeared across several analyzed competitors. Feature evidence suggests the product may already support related capabilities, but public messaging may not emphasize "${po.theme}".`
          : `This theme appeared across several analyzed competitors and was not detected in current product feature or positioning evidence.`,
        evidence: [{ type: 'competitor_positioning_theme', description: po.theme, competitors: po.supportingCompetitors, supportingCount: po.supportingCompetitors.length }],
        priorityScore,
        confidenceScore,
        caution: capabilityLikelyExists
          ? 'This may be a messaging gap rather than a capability gap; the underlying capability was not independently confirmed.'
          : 'This does not confirm the product lacks this capability — it reflects an absence in extracted public evidence only.',
      });
    }

    return drafts;
  }

  // --- audience opportunities ---

  private buildAudienceOpportunities(
    positioning: MarketGapAnalysisInput['positioning'],
    competitors: MarketGapAnalysisInput['positioning']['competitorPositioning'],
    totalCompetitors: number,
  ): DraftOpportunity[] {
    const drafts: DraftOpportunity[] = [];
    const productAudiences = new Set(positioning.productPositioning.audienceSignals.map((a) => a.toLowerCase()));

    const audienceCounts = new Map<string, string[]>();
    for (const c of competitors) {
      for (const audience of c.audienceSignals) {
        if (!audienceCounts.has(audience)) audienceCounts.set(audience, []);
        audienceCounts.get(audience)!.push(c.competitorName);
      }
    }

    for (const [audience, names] of audienceCounts) {
      if (productAudiences.has(audience.toLowerCase())) continue;
      const ratio = totalCompetitors > 0 ? names.length / totalCompetitors : 0;
      if (totalCompetitors >= MIN_COMPETITORS_FOR_PATTERN && ratio >= AUDIENCE_MIN_SUPPORT_RATIO) {
        const { priorityScore, confidenceScore } = this.scoreFromSupport(names.length, totalCompetitors, positioning.confidenceScore);
        drafts.push({
          category: 'audience',
          opportunityType: 'audience_opportunity',
          title: `Possible audience exploration: ${audience}`,
          description: `Public evidence suggests ${names.length} analyzed competitor(s) explicitly mention "${audience}" as an audience, while current product messaging does not.`,
          evidence: [{ type: 'competitor_audience_signal', description: audience, competitors: names, supportingCount: names.length }],
          priorityScore,
          confidenceScore,
          caution: 'This may represent an audience worth exploring, not a recommendation to target this segment.',
        });
      }
    }

    for (const audience of positioning.productPositioning.audienceSignals) {
      const supporting = audienceCounts.get(audience) ?? [];
      const ratio = totalCompetitors > 0 ? supporting.length / totalCompetitors : 0;
      if (totalCompetitors > 0 && ratio <= 0.34) {
        const { priorityScore, confidenceScore } = this.scoreFromSupport(totalCompetitors - supporting.length, Math.max(totalCompetitors, 1), positioning.confidenceScore);
        drafts.push({
          category: 'audience',
          opportunityType: 'differentiation_opportunity',
          title: `Potential audience differentiation: ${audience}`,
          description: `The product's public messaging references "${audience}" as an audience, while few or none of the analyzed competitors do.`,
          evidence: [{ type: 'product_audience_signal', description: audience, competitors: supporting, supportingCount: supporting.length }],
          priorityScore,
          confidenceScore,
          caution: 'Reflects public messaging only; based on a limited set of analyzed competitors.',
        });
      }
    }

    return drafts;
  }

  // --- pricing opportunities ---

  private buildPricingOpportunities(
    positioning: MarketGapAnalysisInput['positioning'],
    competitors: MarketGapAnalysisInput['positioning']['competitorPositioning'],
    totalCompetitors: number,
  ): DraftOpportunity[] {
    if (totalCompetitors < MIN_COMPETITORS_FOR_PATTERN) return [];

    const drafts: DraftOpportunity[] = [];
    const productPricing = new Set(positioning.productPositioning.pricingPosition);
    const enterpriseCount = competitors.filter((c) => c.pricingPosition.includes('Enterprise / Custom Pricing')).length;
    const freemiumCount = competitors.filter((c) => c.pricingPosition.includes('Free / Freemium')).length;

    const productIsTransparent =
      productPricing.has('Free / Freemium') || productPricing.has('Subscription / Paid') || productPricing.has('Low-entry-price');
    const productIsUnclear = productPricing.size === 1 && productPricing.has('Pricing Unclear');
    const productIsFreemium = productPricing.has('Free / Freemium');

    if (enterpriseCount / totalCompetitors >= 0.5 && productIsTransparent) {
      const { priorityScore, confidenceScore } = this.scoreFromSupport(enterpriseCount, totalCompetitors, positioning.confidenceScore);
      drafts.push({
        category: 'pricing',
        opportunityType: 'pricing_opportunity',
        title: 'Possible transparent-pricing differentiation',
        description: `Public pricing evidence suggests ${enterpriseCount}/${totalCompetitors} analyzed competitors emphasize enterprise/custom pricing, while the product publicly exposes more transparent, self-service pricing signals.`,
        evidence: [{ type: 'pricing_pattern', description: 'Enterprise / Custom Pricing', competitors: competitors.filter((c) => c.pricingPosition.includes('Enterprise / Custom Pricing')).map((c) => c.competitorName), supportingCount: enterpriseCount }],
        priorityScore,
        confidenceScore,
        caution: 'Based on public pricing pages only; does not account for negotiated or unpublished pricing.',
      });
    }

    if (freemiumCount / totalCompetitors >= 0.5 && productIsUnclear) {
      const { priorityScore, confidenceScore } = this.scoreFromSupport(freemiumCount, totalCompetitors, positioning.confidenceScore);
      drafts.push({
        category: 'pricing',
        opportunityType: 'pricing_opportunity',
        title: 'Possible pricing clarity opportunity',
        description: `Public evidence suggests ${freemiumCount}/${totalCompetitors} analyzed competitors publicly offer free/freemium pricing, while the product's public pricing signals were unclear.`,
        evidence: [{ type: 'pricing_pattern', description: 'Free / Freemium', competitors: competitors.filter((c) => c.pricingPosition.includes('Free / Freemium')).map((c) => c.competitorName), supportingCount: freemiumCount }],
        priorityScore,
        confidenceScore,
        caution: 'Evaluate whether publicly exposing pricing information is relevant to this market; not a guaranteed benefit.',
      });
    }

    if (productIsFreemium && freemiumCount === 0) {
      const { priorityScore, confidenceScore } = this.scoreFromSupport(totalCompetitors, totalCompetitors, positioning.confidenceScore);
      drafts.push({
        category: 'pricing',
        opportunityType: 'pricing_opportunity',
        title: 'Possible freemium differentiation',
        description: `The product publicly offers free/freemium pricing, while none of the ${totalCompetitors} analyzed competitors do so publicly.`,
        evidence: [{ type: 'pricing_pattern', description: 'Free / Freemium (product only)', competitors: [], supportingCount: totalCompetitors }],
        priorityScore,
        confidenceScore,
        caution: 'Based on public pricing pages only; competitors may offer unpublished free tiers.',
      });
    }
    return drafts;
  }

  // --- go-to-market / CTA opportunities ---

  private buildGoToMarketOpportunities(
    positioning: MarketGapAnalysisInput['positioning'],
    competitors: MarketGapAnalysisInput['positioning']['competitorPositioning'],
    totalCompetitors: number,
  ): DraftOpportunity[] {
    if (totalCompetitors < MIN_COMPETITORS_FOR_PATTERN) return [];

    const drafts: DraftOpportunity[] = [];
    const productCtas = new Set(positioning.productPositioning.ctaThemes);
    const salesLedCount = competitors.filter((c) => c.ctaThemes.includes('Demo') || c.ctaThemes.includes('Contact Sales')).length;
    const trialCount = competitors.filter((c) => c.ctaThemes.includes('Try Free / Trial')).length;

    const productSelfService = productCtas.has('Try Free / Trial') || productCtas.has('Get Started') || productCtas.has('Sign Up');
    const productSalesLed = productCtas.has('Demo') || productCtas.has('Contact Sales');

    if (salesLedCount / totalCompetitors >= 0.5 && productSelfService && !productSalesLed) {
      const { priorityScore, confidenceScore } = this.scoreFromSupport(salesLedCount, totalCompetitors, positioning.confidenceScore);
      drafts.push({
        category: 'go-to-market',
        opportunityType: 'go_to_market_opportunity',
        title: 'Possible self-service go-to-market pattern',
        description: `${salesLedCount}/${totalCompetitors} analyzed competitors primarily use demo/contact-sales CTAs, while the product's public CTAs lean self-service.`,
        evidence: [{ type: 'cta_pattern', description: 'Demo / Contact Sales', competitors: competitors.filter((c) => c.ctaThemes.includes('Demo') || c.ctaThemes.includes('Contact Sales')).map((c) => c.competitorName), supportingCount: salesLedCount }],
        priorityScore,
        confidenceScore,
        caution: 'Reflects public CTA wording only, not confirmed sales motion or internal go-to-market strategy.',
      });
    }

    if (trialCount / totalCompetitors >= 0.5 && !productCtas.has('Try Free / Trial')) {
      const { priorityScore, confidenceScore } = this.scoreFromSupport(trialCount, totalCompetitors, positioning.confidenceScore);
      drafts.push({
        category: 'go-to-market',
        opportunityType: 'go_to_market_opportunity',
        title: 'Possible trial-path evaluation opportunity',
        description: `${trialCount}/${totalCompetitors} analyzed competitors publicly offer a trial-oriented CTA, while the product's public CTAs did not include one.`,
        evidence: [{ type: 'cta_pattern', description: 'Try Free / Trial', competitors: competitors.filter((c) => c.ctaThemes.includes('Try Free / Trial')).map((c) => c.competitorName), supportingCount: trialCount }],
        priorityScore,
        confidenceScore,
        caution: 'Evaluate whether a trial-oriented acquisition path is relevant; not a guaranteed improvement.',
      });
    }

    return drafts;
  }

  // --- small, bounded combination opportunities ---

  private buildCombinationOpportunities(
    drafts: DraftOpportunity[],
    positioning: MarketGapAnalysisInput['positioning'],
  ): DraftOpportunity[] {
    const combos: DraftOpportunity[] = [];
    const productCtas = new Set(positioning.productPositioning.ctaThemes);
    const productSelfService = productCtas.has('Try Free / Trial') || productCtas.has('Get Started') || productCtas.has('Sign Up');

    const enterpriseGap = drafts.find((d) => d.opportunityType === 'positioning_gap' && /Enterprise Readiness|Security/i.test(d.title));
    if (enterpriseGap && productSelfService) {
      combos.push({
        category: 'differentiation',
        opportunityType: 'differentiation_opportunity',
        title: 'Potential differentiation opportunity: self-service positioning vs. enterprise-focused competitors',
        description: 'Public evidence suggests several analyzed competitors emphasize enterprise/security messaging with sales-led CTAs, while the product\'s public messaging leans self-service. This combination may represent a positioning angle worth exploring.',
        evidence: [...enterpriseGap.evidence],
        priorityScore: this.clamp(enterpriseGap.priorityScore + 10, 0, 100),
        confidenceScore: enterpriseGap.confidenceScore,
        caution: 'Combines two independent public signals; validate before adjusting positioning strategy.',
      });
    }

    const differentiatorDraft = drafts.find((d) => d.opportunityType === 'differentiation_opportunity' && d.evidence.some((e) => e.type === 'product_differentiator'));
    const audienceOpportunity = drafts.find((d) => d.opportunityType === 'audience_opportunity');
    if (differentiatorDraft && audienceOpportunity) {
      combos.push({
        category: 'differentiation',
        opportunityType: 'differentiation_opportunity',
        title: `Potential combined opportunity: ${differentiatorDraft.evidence[0]?.description ?? 'product differentiator'} for an underexplored audience`,
        description: `A product differentiator and an underexplored audience signal were both identified from public evidence; together they may reinforce a stronger positioning angle.`,
        evidence: [...differentiatorDraft.evidence, ...audienceOpportunity.evidence],
        priorityScore: this.clamp(Math.max(differentiatorDraft.priorityScore, audienceOpportunity.priorityScore) + 10, 0, 100),
        confidenceScore: Math.round((differentiatorDraft.confidenceScore + audienceOpportunity.confidenceScore) / 2),
        caution: 'Combines two independent public signals; validate before adjusting positioning strategy.',
      });
    }

    return combos.slice(0, 2);
  }

  // --- common market patterns (observations, not opportunities) ---

  private buildCommonMarketPatterns(positioning: MarketGapAnalysisInput['positioning'], totalCompetitors: number): CommonMarketPattern[] {
    if (totalCompetitors < MIN_COMPETITORS_FOR_PATTERN) return [];

    const patterns: CommonMarketPattern[] = [];
    const competitors = positioning.competitorPositioning.slice(0, this.getMaxCompetitors());

    const themeCounts = new Map<string, number>();
    for (const c of competitors) for (const theme of c.valueThemes) themeCounts.set(theme, (themeCounts.get(theme) ?? 0) + 1);
    for (const [theme, count] of themeCounts) {
      const prevalence = count / totalCompetitors;
      if (prevalence >= PATTERN_MIN_SUPPORT_RATIO) {
        patterns.push({
          category: 'positioning',
          label: theme,
          competitorCount: count,
          totalCompetitors,
          prevalencePercent: Math.round(prevalence * 100),
          interpretation: 'Common market messaging; likely weak as a standalone differentiator.',
        });
      }
    }

    const pricingCounts = new Map<string, number>();
    for (const c of competitors) for (const p of c.pricingPosition) pricingCounts.set(p, (pricingCounts.get(p) ?? 0) + 1);
    for (const [label, count] of pricingCounts) {
      const prevalence = count / totalCompetitors;
      if (prevalence >= PATTERN_MIN_SUPPORT_RATIO) {
        patterns.push({
          category: 'pricing',
          label,
          competitorCount: count,
          totalCompetitors,
          prevalencePercent: Math.round(prevalence * 100),
          interpretation: 'Common pricing approach among analyzed competitors.',
        });
      }
    }

    const ctaCounts = new Map<string, number>();
    for (const c of competitors) for (const cta of c.ctaThemes) ctaCounts.set(cta, (ctaCounts.get(cta) ?? 0) + 1);
    for (const [label, count] of ctaCounts) {
      const prevalence = count / totalCompetitors;
      if (prevalence >= PATTERN_MIN_SUPPORT_RATIO) {
        patterns.push({
          category: 'go-to-market',
          label,
          competitorCount: count,
          totalCompetitors,
          prevalencePercent: Math.round(prevalence * 100),
          interpretation: 'Common go-to-market CTA pattern among analyzed competitors.',
        });
      }
    }

    const audienceCounts = new Map<string, number>();
    for (const c of competitors) for (const a of c.audienceSignals) audienceCounts.set(a, (audienceCounts.get(a) ?? 0) + 1);
    for (const [label, count] of audienceCounts) {
      const prevalence = count / totalCompetitors;
      if (prevalence >= PATTERN_MIN_SUPPORT_RATIO) {
        patterns.push({
          category: 'audience',
          label,
          competitorCount: count,
          totalCompetitors,
          prevalencePercent: Math.round(prevalence * 100),
          interpretation: 'Commonly targeted audience among analyzed competitors.',
        });
      }
    }

    return patterns;
  }

  // --- confidence / warnings ---

  private computeOverallConfidence(
    featureComparison: MarketGapAnalysisInput['featureComparison'],
    positioning: MarketGapAnalysisInput['positioning'],
    marketCategory: MarketGapAnalysisInput['marketCategory'],
    totalCompetitors: number,
  ): number {
    const breadthScore = Math.min(100, totalCompetitors * 20);
    const score =
      featureComparison.confidenceScore * 0.35 +
      positioning.confidenceScore * 0.35 +
      marketCategory.confidenceScore * 0.15 +
      breadthScore * 0.15;
    return this.clamp(Math.round(score), 0, 100);
  }

  private buildWarnings(
    featureComparison: MarketGapAnalysisInput['featureComparison'],
    positioning: MarketGapAnalysisInput['positioning'],
    marketCategory: MarketGapAnalysisInput['marketCategory'],
    totalCompetitors: number,
  ): string[] {
    const warnings: string[] = [EVIDENCE_SCOPE_WARNING];
    if (totalCompetitors <= 1) warnings.push('Only a small number of competitors were available for comparison.');
    if (featureComparison.confidenceScore < 40) warnings.push('Feature extraction confidence is limited.');
    if (!marketCategory.primaryCategory || marketCategory.warnings.some((w) => /ambiguous/i.test(w))) {
      warnings.push('Market category is ambiguous.');
    }
    warnings.push(...positioning.warnings.filter((w) => /partial/i.test(w)));
    warnings.push(HYPOTHESIS_WARNING);
    return this.dedupe(warnings);
  }

  // --- shared helpers ---

  private scoreFromSupport(supportingCount: number, totalCompetitors: number, baseConfidence: number): { priorityScore: number; confidenceScore: number } {
    const ratio = totalCompetitors > 0 ? this.clamp(supportingCount / totalCompetitors, 0, 1) : 0;
    const confidenceScore = this.clamp(Math.round(ratio * 60 + (baseConfidence / 100) * 40), 0, 100);
    const priorityScore = this.clamp(Math.round(ratio * 50 + (baseConfidence / 100) * 30 + Math.min(supportingCount, 3) * 6.67), 0, 100);
    return { priorityScore, confidenceScore };
  }

  private dedupeDrafts(drafts: DraftOpportunity[]): DraftOpportunity[] {
    const seen = new Set<string>();
    const result: DraftOpportunity[] = [];
    for (const draft of drafts) {
      const key = draft.title.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(draft);
    }
    return result;
  }

  private dedupe(items: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of items) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }
    return result;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private getMaxOpportunities(): number {
    return this.getEnvNumber('MARKET_GAP_MAX_OPPORTUNITIES', DEFAULT_MAX_OPPORTUNITIES);
  }

  private getMaxStrongest(): number {
    return this.getEnvNumber('MARKET_GAP_MAX_STRONGEST', DEFAULT_MAX_STRONGEST);
  }

  private getMaxCompetitors(): number {
    return this.getEnvNumber('MARKET_GAP_MAX_COMPETITORS', DEFAULT_MAX_COMPETITORS);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
