import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductsService } from '../products/products.service';
import { ProductWebsiteKnowledgeService } from '../website-intelligence/product-website-knowledge.service';
import { CompetitorFeatureComparisonService } from './competitor-feature-comparison.service';
import { CompetitorWebsiteAnalysisService } from './competitor-website-analysis.service';
import { MarketCategoryService } from './market-category.service';
import type {
  CompetitorPositioningAnalysisResult,
  CompetitorPositioningProfile,
  PositioningAnalysisInput,
  PositioningCompetitorInput,
  PositioningEntityEvidence,
  PositioningOpportunity,
  PositioningOverlap,
  ProductPositioningProfile,
} from './types/competitor-positioning.types';

const DEFAULT_MAX_STATEMENTS = 10;
const DEFAULT_MAX_COMPETITORS = 5;
const DEFAULT_MAX_THEMES = 12;
const DEFAULT_MAX_AUDIENCE_SIGNALS = 10;
const DEFAULT_MAX_OPPORTUNITIES = 10;

const LOW_PRICE_THRESHOLD = 50;
const GAP_THEME_SUPPORT_RATIO = 0.5;
const DIFFERENTIATION_SUPPORT_RATIO = 0.34;

const GENERIC_LOW_VALUE_TERMS = new Set([
  'product', 'products', 'platform', 'solutions', 'solution', 'features', 'feature',
  'home', 'overview', 'pricing', 'about', 'company', 'learn more',
]);
const NUMERIC_METRIC_PATTERN = /^[$₹€£]?\s?\d[\d.,]*\s?(%|k|m|b|x|months?|years?|days?|weeks?|minutes?|hours?)?$/i;

const VALUE_THEME_CLUSTERS: { theme: string; terms: string[] }[] = [
  { theme: 'AI-Powered', terms: ['ai-powered', 'ai powered', 'artificial intelligence', 'machine learning', ' ai '] },
  { theme: 'Automation', terms: ['automat'] },
  { theme: 'Ease of Use', terms: ['easy', 'simple', 'intuitive', 'user-friendly', 'effortless'] },
  { theme: 'Speed / Efficiency', terms: ['fast', 'faster', 'speed', 'efficient', 'quick', 'instant'] },
  { theme: 'Cost Savings', terms: ['save money', 'cost-effective', 'affordable', 'reduce cost', 'lower cost'] },
  { theme: 'Enterprise Readiness', terms: ['enterprise', 'enterprise-grade'] },
  { theme: 'Security', terms: ['security', 'secure', 'encryption'] },
  { theme: 'Collaboration', terms: ['collaborat', 'team administration', 'together'] },
  { theme: 'Analytics / Insights', terms: ['analytics', 'insight', 'reporting', 'dashboard', 'data-driven', 'evaluat'] },
  { theme: 'Customization', terms: ['custom', 'personalize', 'personalized', 'tailor', 'configurable'] },
  { theme: 'Integration', terms: ['integrat', 'api', 'connect', 'sync'] },
  { theme: 'Developer Experience', terms: ['developer', 'sdk', 'cli', 'api-first'] },
  { theme: 'Reliability', terms: ['reliable', 'uptime', 'stable', 'trusted'] },
  { theme: 'Scalability', terms: ['scalab', 'scale'] },
  { theme: 'Learning / Improvement', terms: ['learn', 'improve', 'practice', 'feedback', 'progress', 'skill'] },
  { theme: 'Compliance', terms: ['compliance', 'gdpr', 'soc 2', 'hipaa'] },
  { theme: 'Convenience', terms: ['convenient', 'anytime', 'anywhere', 'on-demand', 'on demand'] },
];

const AUDIENCE_CLUSTERS: { label: string; terms: string[] }[] = [
  { label: 'Developers', terms: ['developer', 'engineer', 'programmer'] },
  { label: 'Enterprises', terms: ['enterprise', 'large organization', 'large team'] },
  { label: 'Small Businesses', terms: ['small business', 'smb', 'small team'] },
  { label: 'Teams', terms: ['team', 'teams'] },
  { label: 'Candidates', terms: ['candidate', 'job seeker'] },
  { label: 'Recruiters', terms: ['recruiter', 'hiring manager', 'talent acquisition'] },
  { label: 'Students', terms: ['student', 'learner'] },
  { label: 'Marketers', terms: ['marketer', 'marketing team'] },
  { label: 'Sales Teams', terms: ['sales team', 'sales rep', 'salesperson'] },
  { label: 'HR Teams', terms: ['hr team', 'human resources'] },
  { label: 'Agencies', terms: ['agency', 'agencies'] },
  { label: 'Educators', terms: ['educator', 'teacher', 'instructor'] },
];

const CTA_THEME_CLUSTERS: { theme: string; terms: string[] }[] = [
  { theme: 'Try Free / Trial', terms: ['free trial', 'start free', 'try free', 'trial'] },
  { theme: 'Get Started', terms: ['get started', 'start now', 'start building'] },
  { theme: 'Sign Up', terms: ['sign up', 'signup', 'create account', 'register'] },
  { theme: 'Contact Sales', terms: ['contact sales', 'talk to sales', 'request a quote'] },
  { theme: 'Demo', terms: ['demo'] },
  { theme: 'Download', terms: ['download'] },
  { theme: 'Buy / Upgrade', terms: ['buy now', 'upgrade', 'purchase', 'subscribe'] },
  { theme: 'Learn More', terms: ['learn more', 'read more', 'explore'] },
];

@Injectable()
export class CompetitorPositioningService {
  constructor(
    private readonly configService: ConfigService,
    private readonly productsService: ProductsService,
    private readonly productWebsiteKnowledgeService: ProductWebsiteKnowledgeService,
    private readonly marketCategoryService: MarketCategoryService,
    private readonly competitorWebsiteAnalysisService: CompetitorWebsiteAnalysisService,
    private readonly competitorFeatureComparisonService: CompetitorFeatureComparisonService,
  ) {}

  /**
   * Product-scoped orchestration. Tenant lookup happens first. Competitor
   * discovery + website analysis run exactly once (via the already-existing
   * CompetitorWebsiteAnalysisService); feature comparison and positioning
   * analysis both operate on that single result — no re-fetching.
   */
  async analyzeForProduct(organizationId: string, productId: string, userId: string): Promise<CompetitorPositioningAnalysisResult> {
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

    const competitorInputs: PositioningCompetitorInput[] = analysis.analyzedCompetitors.map((c) => ({
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

    const featureComparison = this.competitorFeatureComparisonService.compare({
      productFeatures,
      competitors: competitorInputs.map((c) => ({ name: c.name, domain: c.domain, confidenceScore: c.confidenceScore, features: c.features })),
      marketCategory: marketCategory.primaryCategory,
    });

    const result = this.analyze({
      product: productEvidence,
      competitors: competitorInputs,
      marketCategory: marketCategory.primaryCategory,
      marketDescriptors: marketCategory.descriptors,
      featureComparison: {
        productDifferentiators: featureComparison.productDifferentiators,
        possibleFeatureGaps: featureComparison.possibleFeatureGaps,
        commonCapabilities: featureComparison.commonCapabilities,
      },
    });

    if (analysis.analysisFailures.length > 0) {
      result.warnings = this.dedupe([...result.warnings, 'Positioning analysis is based on partial competitor coverage.']);
    }

    result.stats.discoveredCompetitors = analysis.discoveredCompetitors;
    result.stats.analyzedCompetitors = analysis.stats.analyzed;

    return result;
  }

  analyze(input: PositioningAnalysisInput): CompetitorPositioningAnalysisResult {
    const marketDescriptors = input.marketDescriptors ?? [];
    const productPositioning = this.buildProfile(input.product, marketDescriptors);

    const rankedCompetitors = [...input.competitors]
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .slice(0, this.getMaxCompetitors());

    const competitorPositioning: CompetitorPositioningProfile[] = rankedCompetitors.map((c) => ({
      competitorName: c.name,
      competitorDomain: c.domain,
      confidenceScore: c.confidenceScore,
      ...this.buildProfile(c, marketDescriptors),
    }));

    // "Usable" = the profile carries any actual positioning signal, as
    // opposed to a competitor that was analyzed but exposed nothing we
    // could extract (empty statements and no detected themes).
    const usableCompetitors = competitorPositioning.filter(
      (c) => c.positioningStatements.length > 0 || c.valueThemes.length > 0,
    );

    const commonPositioningThemes = this.buildCommonThemes(usableCompetitors);
    const overlap = this.buildOverlap(productPositioning, usableCompetitors);
    const opportunities = this.buildOpportunities(productPositioning, usableCompetitors, input.featureComparison);

    const confidenceScore = this.computeConfidence(productPositioning, usableCompetitors);
    const warnings = this.buildWarnings(productPositioning, usableCompetitors, competitorPositioning.length);

    const themesDetected = new Set([...productPositioning.valueThemes, ...competitorPositioning.flatMap((c) => c.valueThemes)]).size;

    return {
      marketCategory: input.marketCategory,
      productPositioning,
      competitorPositioning,
      commonPositioningThemes,
      overlap,
      opportunities,
      confidenceScore,
      warnings,
      stats: {
        discoveredCompetitors: input.competitors.length,
        analyzedCompetitors: input.competitors.length,
        competitorsUsed: usableCompetitors.length,
        positioningThemesDetected: themesDetected,
      },
      analyzedAt: new Date(),
    };
  }

  private buildProfile(evidence: PositioningEntityEvidence, marketDescriptors: string[]): ProductPositioningProfile {
    const statementCandidates = [evidence.title, evidence.metaDescription, ...evidence.keyStatements].filter(
      (t): t is string => !!t && !this.isLowValueStatement(t),
    );
    const positioningStatements = this.dedupe(statementCandidates).slice(0, this.getMaxStatements());

    const themeTexts = [...positioningStatements, ...evidence.features, ...evidence.technicalFacts, ...evidence.documentationTopics];
    const valueThemes = this.detectThemes(themeTexts);

    const audienceTexts = [
      ...positioningStatements,
      ...evidence.features,
      ...evidence.documentationTopics,
      ...evidence.callsToAction,
      ...marketDescriptors,
    ];
    const audienceSignals = this.detectAudienceSignals(audienceTexts);

    const pricingPosition = this.derivePricingPosition(evidence.pricingSignals);
    const ctaThemes = this.detectCtaThemes(evidence.callsToAction);

    return { positioningStatements, valueThemes, audienceSignals, pricingPosition, ctaThemes };
  }

  private buildCommonThemes(competitors: CompetitorPositioningProfile[]): string[] {
    if (competitors.length === 0) return [];
    const required = competitors.length === 1 ? 1 : 2;
    const counts = new Map<string, number>();
    for (const c of competitors) for (const theme of c.valueThemes) counts.set(theme, (counts.get(theme) ?? 0) + 1);
    return Array.from(counts.entries())
      .filter(([, count]) => count >= required)
      .map(([theme]) => theme);
  }

  private buildOverlap(product: ProductPositioningProfile, competitors: CompetitorPositioningProfile[]): PositioningOverlap[] {
    const overlaps: PositioningOverlap[] = [];
    for (const theme of product.valueThemes) {
      const matching = competitors.filter((c) => c.valueThemes.includes(theme));
      if (matching.length === 0) continue;
      overlaps.push({
        theme,
        productEvidence: product.positioningStatements.slice(0, 3),
        competitorCount: matching.length,
        competitors: matching.map((c) => c.competitorName),
      });
    }
    return overlaps;
  }

  private buildOpportunities(
    product: ProductPositioningProfile,
    competitors: CompetitorPositioningProfile[],
    featureComparison?: PositioningAnalysisInput['featureComparison'],
  ): PositioningOpportunity[] {
    const opportunities: PositioningOpportunity[] = [];
    const avgConfidence = competitors.length > 0 ? competitors.reduce((s, c) => s + c.confidenceScore, 0) / competitors.length : 0;

    // A) Product theme few/no competitors share -> potential differentiation.
    for (const theme of product.valueThemes) {
      const matching = competitors.filter((c) => c.valueThemes.includes(theme));
      const supportRatio = competitors.length > 0 ? matching.length / competitors.length : 0;
      if (competitors.length > 0 && supportRatio <= DIFFERENTIATION_SUPPORT_RATIO) {
        opportunities.push({
          theme,
          reason: `Potential positioning opportunity: the product emphasizes "${theme}" while few or no analyzed competitors do.`,
          supportingCompetitors: matching.map((c) => c.competitorName),
          confidenceScore: this.scoreOpportunity(1 - supportRatio, avgConfidence),
        });
      }
    }

    // B) Theme many competitors share but product doesn't -> potential gap.
    const competitorThemeCounts = new Map<string, string[]>();
    for (const c of competitors) {
      for (const theme of c.valueThemes) {
        if (!competitorThemeCounts.has(theme)) competitorThemeCounts.set(theme, []);
        competitorThemeCounts.get(theme)!.push(c.competitorName);
      }
    }
    for (const [theme, names] of competitorThemeCounts) {
      if (product.valueThemes.includes(theme)) continue;
      const supportRatio = competitors.length > 0 ? names.length / competitors.length : 0;
      if (competitors.length >= 2 && supportRatio >= GAP_THEME_SUPPORT_RATIO) {
        opportunities.push({
          theme,
          reason: `Potential positioning opportunity: many analyzed competitors emphasize "${theme}", but current product messaging does not.`,
          supportingCompetitors: names,
          confidenceScore: this.scoreOpportunity(supportRatio, avgConfidence),
        });
      }
    }

    // C) Feature-comparison differentiator not reflected in positioning copy.
    for (const differentiator of featureComparison?.productDifferentiators ?? []) {
      if (this.mentionsCapability(product.positioningStatements, differentiator)) continue;
      opportunities.push({
        theme: differentiator,
        reason: `Potential messaging opportunity: "${differentiator}" is a product differentiator per feature comparison but is not clearly reflected in current positioning statements.`,
        supportingCompetitors: [],
        confidenceScore: this.scoreOpportunity(1, avgConfidence),
      });
    }

    return opportunities
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .slice(0, this.getMaxOpportunities());
  }

  private mentionsCapability(statements: string[], capability: string): boolean {
    const tokens = capability.toLowerCase().split(/\s+/).filter((t) => t.length > 3);
    if (tokens.length === 0) return false;
    const haystack = statements.join(' ').toLowerCase();
    return tokens.some((t) => haystack.includes(t));
  }

  private scoreOpportunity(supportRatio: number, avgConfidence: number): number {
    return this.clamp(Math.round(supportRatio * 60 + (avgConfidence / 100) * 40), 0, 100);
  }

  private computeConfidence(product: ProductPositioningProfile, competitors: CompetitorPositioningProfile[]): number {
    if (product.positioningStatements.length === 0 && product.valueThemes.length === 0) return 0;
    if (competitors.length === 0) return this.clamp(product.positioningStatements.length * 5, 0, 25);

    let score = 0;
    score += Math.min(30, product.positioningStatements.length * 6);
    score += Math.min(20, product.valueThemes.length * 5);
    score += Math.min(25, competitors.length * 12);
    const mediumHighCount = competitors.filter((c) => c.confidenceScore >= 50).length;
    score += Math.round((mediumHighCount / Math.max(competitors.length, 1)) * 25);

    return this.clamp(Math.round(score), 0, 100);
  }

  private buildWarnings(product: ProductPositioningProfile, competitors: CompetitorPositioningProfile[], totalCompetitorCount: number): string[] {
    const warnings: string[] = [];
    if (product.positioningStatements.length === 0) {
      warnings.push('Product positioning evidence is limited.');
    }
    if (competitors.length > 0 && competitors.length === 1) {
      warnings.push('Only a small number of competitors had usable positioning evidence.');
    }
    if (totalCompetitorCount > competitors.length) {
      warnings.push('Some competitor websites exposed limited feature information.');
    }
    if (competitors.some((c) => c.pricingPosition.length === 1 && c.pricingPosition[0] === 'Pricing Unclear')) {
      warnings.push('Pricing positioning could not be determined for some competitors.');
    }
    warnings.push('Positioning analysis is based on public website messaging and may not reflect full go-to-market strategy.');
    return this.dedupe(warnings);
  }

  // --- theme / audience / pricing / CTA detection ---

  private detectThemes(texts: string[]): string[] {
    const haystack = ` ${texts.join(' ').toLowerCase()} `;
    const themes: string[] = [];
    for (const cluster of VALUE_THEME_CLUSTERS) {
      if (cluster.terms.some((term) => haystack.includes(term))) themes.push(cluster.theme);
    }
    return themes.slice(0, this.getMaxThemes());
  }

  private detectAudienceSignals(texts: string[]): string[] {
    const haystack = texts.join(' ').toLowerCase();
    const labels: string[] = [];
    for (const cluster of AUDIENCE_CLUSTERS) {
      if (cluster.terms.some((term) => haystack.includes(term))) labels.push(cluster.label);
    }
    return labels.slice(0, this.getMaxAudienceSignals());
  }

  private detectCtaThemes(ctas: string[]): string[] {
    const haystack = ctas.join(' ').toLowerCase();
    const themes: string[] = [];
    for (const cluster of CTA_THEME_CLUSTERS) {
      if (cluster.terms.some((term) => haystack.includes(term))) themes.push(cluster.theme);
    }
    return themes;
  }

  private derivePricingPosition(signals: string[]): string[] {
    if (!signals || signals.length === 0) return ['Pricing Unclear'];
    const joined = signals.join(' ').toLowerCase();
    const positions = new Set<string>();

    if (/\bfree\b/.test(joined) || /\$\s?0\b/.test(joined)) positions.add('Free / Freemium');
    if (/\benterprise\b|\bcontact sales\b|\bcustom pricing\b/.test(joined)) positions.add('Enterprise / Custom Pricing');

    const numbers = Array.from(joined.matchAll(/[$₹€£]\s?(\d+(?:\.\d+)?)/g)).map((m) => Number(m[1]));
    if (numbers.length > 0) {
      if (Math.min(...numbers) <= LOW_PRICE_THRESHOLD) positions.add('Low-entry-price');
      positions.add('Subscription / Paid');
    } else if (/\bmonth\b|\/mo\b|\byear\b|\bannual\b|subscription/.test(joined)) {
      positions.add('Subscription / Paid');
    }

    return positions.size > 0 ? Array.from(positions) : ['Pricing Unclear'];
  }

  private isLowValueStatement(text: string): boolean {
    const t = text.trim();
    if (!t) return true;
    if (NUMERIC_METRIC_PATTERN.test(t)) return true;
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length === 1 && GENERIC_LOW_VALUE_TERMS.has(t.toLowerCase())) return true;
    if (words.length === 1 && t.length < 4) return true;
    return false;
  }

  private dedupe(items: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of items) {
      const normalized = raw.replace(/\s+/g, ' ').trim();
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(normalized);
    }
    return result;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private getMaxStatements(): number {
    return this.getEnvNumber('POSITIONING_MAX_STATEMENTS', DEFAULT_MAX_STATEMENTS);
  }

  private getMaxCompetitors(): number {
    return this.getEnvNumber('POSITIONING_MAX_COMPETITORS', DEFAULT_MAX_COMPETITORS);
  }

  private getMaxThemes(): number {
    return this.getEnvNumber('POSITIONING_MAX_THEMES', DEFAULT_MAX_THEMES);
  }

  private getMaxAudienceSignals(): number {
    return this.getEnvNumber('POSITIONING_MAX_AUDIENCE_SIGNALS', DEFAULT_MAX_AUDIENCE_SIGNALS);
  }

  private getMaxOpportunities(): number {
    return this.getEnvNumber('POSITIONING_MAX_OPPORTUNITIES', DEFAULT_MAX_OPPORTUNITIES);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
