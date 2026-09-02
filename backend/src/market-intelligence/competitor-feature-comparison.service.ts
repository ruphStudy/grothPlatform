import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductsService } from '../products/products.service';
import { ProductWebsiteKnowledgeService } from '../website-intelligence/product-website-knowledge.service';
import { CompetitorWebsiteAnalysisService } from './competitor-website-analysis.service';
import { MarketCategoryService } from './market-category.service';
import type {
  CompetitorFeatureComparison,
  CompetitorFeatureComparisonResult,
  FeatureComparisonCompetitorInput,
  FeatureComparisonInput,
  PossibleFeatureGap,
} from './types/competitor-feature-comparison.types';

const DEFAULT_MATCH_THRESHOLD = 0.55;
const DEFAULT_MAX_PRODUCT_FEATURES = 50;
const DEFAULT_MAX_COMPETITOR_FEATURES = 50;

// Looser than the shared-capability match threshold, deliberately: this
// only clusters competitor-only features that are already known to have no
// product match, so we can afford to be generous when deciding whether two
// differently-worded competitor features describe the same missing
// capability (e.g. "coding environment" vs "live coding interview").
const GAP_CLUSTER_THRESHOLD = 0.3;

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'with', 'to', 'of', 'your', 'our', 'their', 'in', 'on', 'via',
  'platform', 'software', 'solution', 'solutions', 'app', 'tool', 'system', 'service', 'services',
]);

interface GapItem {
  text: string;
  competitorName: string;
  competitorConfidence: number;
}

@Injectable()
export class CompetitorFeatureComparisonService {
  constructor(
    private readonly configService: ConfigService,
    private readonly productsService: ProductsService,
    private readonly productWebsiteKnowledgeService: ProductWebsiteKnowledgeService,
    private readonly marketCategoryService: MarketCategoryService,
    private readonly competitorWebsiteAnalysisService: CompetitorWebsiteAnalysisService,
  ) {}

  /**
   * Product-scoped orchestration. Tenant lookup happens first; only then
   * does this reach market category discovery, competitor discovery
   * (Tavily), and competitor website analysis — all reused as-is.
   */
  async compareForProduct(organizationId: string, productId: string, userId: string): Promise<CompetitorFeatureComparisonResult> {
    const product = await this.productsService.findOne(organizationId, productId, userId);

    let productFeatures: string[] = [];
    const websiteUrl = product.websiteUrl?.trim();
    if (websiteUrl) {
      try {
        const knowledge = await this.productWebsiteKnowledgeService.buildKnowledge(websiteUrl);
        productFeatures = knowledge.features;
      } catch {
        // fall through to metadata fallback below
      }
    }
    if (productFeatures.length === 0 && product.shortDescription?.trim()) {
      productFeatures = [product.shortDescription.trim()];
    }

    const marketCategory = await this.marketCategoryService.discoverForProduct(organizationId, productId, userId);
    const analysis = await this.competitorWebsiteAnalysisService.analyzeForProduct(organizationId, productId, userId);

    const competitorInputs: FeatureComparisonCompetitorInput[] = analysis.analyzedCompetitors.map((c) => ({
      name: c.name,
      domain: c.domain,
      confidenceScore: c.confidenceScore,
      features: c.features,
    }));

    const result = this.compare({
      productFeatures,
      competitors: competitorInputs,
      marketCategory: marketCategory.primaryCategory,
    });

    if (analysis.analysisFailures.length > 0) {
      result.warnings = this.dedupe([...result.warnings, 'Feature comparison is based on partial competitor coverage.']);
    }

    result.stats = {
      discoveredCompetitors: analysis.discoveredCompetitors,
      analyzedCompetitors: analysis.stats.analyzed,
      competitorsUsed: result.stats.competitorsUsed,
      productFeatureCount: result.stats.productFeatureCount,
    };

    return result;
  }

  compare(input: FeatureComparisonInput): CompetitorFeatureComparisonResult {
    const warnings: string[] = [];

    const productFeatures = this.dedupeNormalized(input.productFeatures).slice(0, this.getMaxProductFeatures());
    if (productFeatures.length < 3) {
      warnings.push('Product feature evidence is limited.');
    }

    const usableCompetitors = input.competitors.filter((c) => c.features?.length > 0);
    if (input.competitors.length > 0 && usableCompetitors.length < input.competitors.length) {
      warnings.push('Some competitor websites exposed limited feature information.');
    }
    if (usableCompetitors.length === 1) {
      warnings.push('Only one competitor had sufficient feature information.');
    }

    const competitorComparisons = usableCompetitors.map((competitor) => this.compareOne(productFeatures, competitor));

    const commonCapabilities = this.buildCommonCapabilities(productFeatures, competitorComparisons);
    const productDifferentiators = this.buildProductDifferentiators(productFeatures, competitorComparisons);
    const possibleFeatureGaps = this.buildPossibleFeatureGaps(competitorComparisons);

    const confidenceScore = this.computeConfidence(productFeatures, usableCompetitors, input.competitors.length);

    if (productFeatures.length > 0 && usableCompetitors.length > 0) {
      warnings.push('Feature comparison is based on lexical similarity and may miss semantically equivalent capabilities.');
    }

    return {
      marketCategory: input.marketCategory,
      productFeatures,
      competitors: competitorComparisons,
      commonCapabilities,
      productDifferentiators,
      possibleFeatureGaps,
      confidenceScore,
      warnings: this.dedupe(warnings),
      stats: {
        discoveredCompetitors: input.competitors.length,
        analyzedCompetitors: input.competitors.length,
        competitorsUsed: usableCompetitors.length,
        productFeatureCount: productFeatures.length,
      },
      comparedAt: new Date(),
    };
  }

  private compareOne(productFeatures: string[], competitor: FeatureComparisonCompetitorInput): CompetitorFeatureComparison {
    const competitorFeatures = this.dedupeNormalized(competitor.features).slice(0, this.getMaxCompetitorFeatures());
    const threshold = this.getMatchThreshold();

    const sharedCapabilities: { productFeature: string; competitorFeature: string; similarityScore: number }[] = [];
    const matchedProductFeatures = new Set<string>();
    const matchedCompetitorFeatures = new Set<string>();

    for (const productFeature of productFeatures) {
      let best: { feature: string; score: number } | undefined;
      for (const competitorFeature of competitorFeatures) {
        const score = this.similarity(productFeature, competitorFeature);
        if (score >= threshold && (!best || score > best.score)) {
          best = { feature: competitorFeature, score };
        }
      }
      if (best) {
        sharedCapabilities.push({
          productFeature,
          competitorFeature: best.feature,
          similarityScore: Math.round(best.score * 100),
        });
        matchedProductFeatures.add(productFeature);
        matchedCompetitorFeatures.add(best.feature);
      }
    }

    const productOnlyCapabilities = productFeatures.filter((f) => !matchedProductFeatures.has(f));
    const competitorOnlyCapabilities = competitorFeatures.filter((f) => !matchedCompetitorFeatures.has(f));
    const similarityScore =
      productFeatures.length > 0 ? Math.round((matchedProductFeatures.size / productFeatures.length) * 100) : 0;

    return {
      competitorName: competitor.name,
      competitorDomain: competitor.domain,
      competitorConfidenceScore: competitor.confidenceScore,
      sharedCapabilities,
      competitorOnlyCapabilities,
      productOnlyCapabilities,
      similarityScore,
    };
  }

  private buildCommonCapabilities(productFeatures: string[], comparisons: CompetitorFeatureComparison[]): string[] {
    if (comparisons.length === 0) return [];
    const requiredCount = comparisons.length === 1 ? 1 : 2;
    const matchCounts = new Map<string, number>();
    for (const comparison of comparisons) {
      for (const shared of comparison.sharedCapabilities) {
        matchCounts.set(shared.productFeature, (matchCounts.get(shared.productFeature) ?? 0) + 1);
      }
    }
    return productFeatures.filter((f) => (matchCounts.get(f) ?? 0) >= requiredCount);
  }

  private buildProductDifferentiators(productFeatures: string[], comparisons: CompetitorFeatureComparison[]): string[] {
    if (comparisons.length === 0) return [];
    const matchCounts = new Map<string, number>();
    for (const comparison of comparisons) {
      for (const shared of comparison.sharedCapabilities) {
        matchCounts.set(shared.productFeature, (matchCounts.get(shared.productFeature) ?? 0) + 1);
      }
    }
    return productFeatures.filter((f) => (matchCounts.get(f) ?? 0) === 0);
  }

  private buildPossibleFeatureGaps(comparisons: CompetitorFeatureComparison[]): PossibleFeatureGap[] {
    const items: GapItem[] = [];
    for (const comparison of comparisons) {
      for (const feature of comparison.competitorOnlyCapabilities) {
        items.push({
          text: feature,
          competitorName: comparison.competitorName,
          competitorConfidence: comparison.competitorConfidenceScore,
        });
      }
    }

    const clusters: { representative: string; items: GapItem[] }[] = [];
    for (const item of items) {
      const cluster = clusters.find((c) => this.similarity(c.representative, item.text) >= GAP_CLUSTER_THRESHOLD);
      if (cluster) {
        cluster.items.push(item);
      } else {
        clusters.push({ representative: item.text, items: [item] });
      }
    }

    const totalCompetitors = Math.max(comparisons.length, 1);
    const gaps: PossibleFeatureGap[] = clusters.map((cluster) => {
      const competitorNames = Array.from(new Set(cluster.items.map((i) => i.competitorName)));
      const avgConfidence = cluster.items.reduce((sum, i) => sum + i.competitorConfidence, 0) / cluster.items.length;
      const importanceScore = this.clamp(
        Math.round((competitorNames.length / totalCompetitors) * 70 + (avgConfidence / 100) * 30),
        0,
        100,
      );
      return { capability: cluster.representative, competitorCount: competitorNames.length, competitors: competitorNames, importanceScore };
    });

    gaps.sort((a, b) => b.importanceScore - a.importanceScore || b.competitorCount - a.competitorCount);
    return gaps;
  }

  private computeConfidence(
    productFeatures: string[],
    usableCompetitors: FeatureComparisonCompetitorInput[],
    totalCompetitorCount: number,
  ): number {
    if (productFeatures.length === 0 || usableCompetitors.length === 0) return 0;

    let score = 0;
    score += Math.min(40, productFeatures.length * 8);
    score += Math.min(30, usableCompetitors.length * 15);
    const avgCompetitorConfidence =
      usableCompetitors.reduce((sum, c) => sum + c.confidenceScore, 0) / usableCompetitors.length;
    score += Math.round((avgCompetitorConfidence / 100) * 20);
    const usableRatio = totalCompetitorCount > 0 ? usableCompetitors.length / totalCompetitorCount : 0;
    score += Math.round(usableRatio * 10);

    return this.clamp(Math.round(score), 0, 100);
  }

  // --- lexical normalization / similarity ---

  private normalizeFeatureText(text: string): string {
    return text
      .toLowerCase()
      .replace(/^[\s"'([{-]+|[\s"')\]}.,!?-]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private stem(token: string): string {
    if (token.endsWith('ing') && token.length > 5) return token.slice(0, -3);
    if (token.endsWith('ed') && token.length > 4) return token.slice(0, -2);
    if (token.endsWith('es') && token.length > 4) return token.slice(0, -2);
    if (token.endsWith('s') && token.length > 3) return token.slice(0, -1);
    return token;
  }

  private tokenize(text: string): string[] {
    return this.normalizeFeatureText(text)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
      .map((t) => this.stem(t));
  }

  private similarity(a: string, b: string): number {
    const tokensA = new Set(this.tokenize(a));
    const tokensB = new Set(this.tokenize(b));
    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let intersection = 0;
    for (const t of tokensA) if (tokensB.has(t)) intersection += 1;

    const overlap = intersection / Math.min(tokensA.size, tokensB.size);

    const normA = this.normalizeFeatureText(a);
    const normB = this.normalizeFeatureText(b);
    const containmentBonus = normA.length > 0 && normB.length > 0 && (normA.includes(normB) || normB.includes(normA)) ? 0.15 : 0;

    return Math.min(1, overlap + containmentBonus);
  }

  private dedupeNormalized(items: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of items ?? []) {
      if (!raw) continue;
      const cleaned = raw.replace(/\s+/g, ' ').trim();
      const key = this.normalizeFeatureText(cleaned);
      if (!cleaned || !key || seen.has(key)) continue;
      seen.add(key);
      result.push(cleaned);
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

  private getMatchThreshold(): number {
    const value = this.configService.get<string>('FEATURE_MATCH_THRESHOLD');
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : DEFAULT_MATCH_THRESHOLD;
  }

  private getMaxProductFeatures(): number {
    return this.getEnvNumber('FEATURE_COMPARISON_MAX_PRODUCT_FEATURES', DEFAULT_MAX_PRODUCT_FEATURES);
  }

  private getMaxCompetitorFeatures(): number {
    return this.getEnvNumber('FEATURE_COMPARISON_MAX_COMPETITOR_FEATURES', DEFAULT_MAX_COMPETITOR_FEATURES);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
