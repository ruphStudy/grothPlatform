import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductsService } from '../products/products.service';
import { ProductWebsiteKnowledgeService } from '../website-intelligence/product-website-knowledge.service';
import type {
  MarketCategoryDiscoveryInput,
  MarketCategoryEvidence,
  MarketCategoryResult,
} from './types/market-category.types';

const DEFAULT_MAX_SUBCATEGORIES = 5;
const DEFAULT_MAX_TERMS = 15;
const MAX_METADATA_EVIDENCE = 10;
const MAX_WEBSITE_EVIDENCE = 15;

const MIN_PRIMARY_SCORE = 6;
const AMBIGUITY_RATIO = 0.8;

const MAX_IDENTITY_STATEMENTS_SCANNED = 10;
const MAX_FEATURES_SCANNED = 15;
const MAX_DOC_TOPICS_SCANNED = 10;
const MAX_DOC_FACTS_SCANNED = 10;

interface CategoryCluster {
  label: string;
  descriptor?: string;
  terms: string[];
}

// Small, deterministic signal dictionary. Not an exhaustive taxonomy —
// clusters group related terms into one human-readable category label.
const CATEGORY_CLUSTERS: CategoryCluster[] = [
  {
    label: 'Interview Preparation Software',
    descriptor: 'HR Tech',
    terms: [
      'interview', 'mock interview', 'interview practice', 'interview preparation', 'interview coaching',
      'technical interview', 'candidate assessment', 'interview questions', 'interview feedback',
      'hiring', 'recruiting', 'recruitment', 'job seeker',
    ],
  },
  {
    label: 'Learning & Education Platform',
    descriptor: 'EdTech',
    terms: ['learning', 'education', 'training', 'course', 'curriculum', 'student', 'tutor', 'skill development', 'elearning'],
  },
  {
    label: 'Marketing Automation Platform',
    descriptor: 'MarTech',
    terms: ['marketing automation', 'email marketing', 'marketing campaign', 'lead generation', 'advertising', 'seo', 'content marketing'],
  },
  {
    label: 'Sales & CRM Software',
    descriptor: 'B2B SaaS',
    terms: ['crm', 'sales pipeline', 'lead management', 'deal tracking', 'customer relationship management', 'sales team'],
  },
  {
    label: 'Analytics & Business Intelligence',
    descriptor: 'B2B SaaS',
    terms: ['analytics', 'dashboard', 'reporting', 'business intelligence', 'data visualization', 'insights', 'metrics'],
  },
  {
    label: 'Finance & Accounting Software',
    descriptor: 'FinTech',
    terms: ['accounting', 'bookkeeping', 'invoicing', 'tax', 'budgeting', 'expense management', 'financial planning'],
  },
  {
    label: 'Payments Platform',
    descriptor: 'FinTech',
    terms: ['payments', 'payment processing', 'checkout', 'billing', 'transactions', 'payment gateway'],
  },
  {
    label: 'E-commerce & Marketplace',
    descriptor: 'Marketplace',
    terms: ['ecommerce', 'e-commerce', 'marketplace', 'storefront', 'shopping cart', 'online store', 'seller', 'buyer'],
  },
  {
    label: 'Container Development Platform',
    descriptor: 'Developer Tool',
    terms: [
      'container', 'containers', 'docker', 'container image', 'deployment', 'developer platform', 'developer tools',
      'cli', 'command line', 'ci/cd', 'devops', 'kubernetes', 'sdk', 'build and test', 'build, share, and run',
    ],
  },
  {
    label: 'Security & Compliance Software',
    descriptor: 'B2B SaaS',
    terms: ['security', 'compliance', 'encryption', 'vulnerability', 'threat detection', 'firewall', 'authentication'],
  },
  {
    label: 'Healthcare Technology',
    descriptor: 'HealthTech',
    terms: ['healthcare', 'patient', 'clinical', 'medical', 'telehealth', 'electronic health record'],
  },
  {
    label: 'Productivity & Collaboration Software',
    descriptor: 'Productivity Software',
    terms: ['productivity', 'collaboration', 'workflow', 'task management', 'notes', 'team collaboration'],
  },
  {
    label: 'Project Management Software',
    descriptor: 'Productivity Software',
    terms: ['project management', 'kanban', 'sprint planning', 'roadmap', 'milestone tracking'],
  },
  {
    label: 'Customer Support Software',
    descriptor: 'B2B SaaS',
    terms: ['customer support', 'helpdesk', 'ticketing', 'live chat', 'customer service'],
  },
  {
    label: 'HR & Operations Software',
    descriptor: 'HR Tech',
    terms: ['human resources', 'payroll', 'onboarding', 'employee management', 'operations'],
  },
  {
    label: 'Logistics & Supply Chain Software',
    descriptor: 'B2B SaaS',
    terms: ['logistics', 'shipping', 'supply chain', 'fleet management', 'warehouse', 'freight'],
  },
  {
    label: 'Real Estate Technology',
    descriptor: 'PropTech',
    terms: ['real estate', 'property listing', 'tenant', 'lease management'],
  },
  {
    label: 'Communication Software',
    descriptor: 'Productivity Software',
    terms: ['messaging', 'video call', 'team chat', 'communication platform'],
  },
];

interface EvidenceText {
  text: string;
  weight: number;
  source: keyof MarketCategoryEvidence;
}

interface ClusterScore {
  cluster: CategoryCluster;
  score: number;
  matchedTerms: Set<string>;
}

@Injectable()
export class MarketCategoryService {
  private readonly logger = new Logger(MarketCategoryService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly productsService: ProductsService,
    private readonly productWebsiteKnowledgeService: ProductWebsiteKnowledgeService,
  ) {}

  /**
   * Product-scoped orchestration: looks up the product (tenant-checked),
   * best-effort builds website knowledge (failure falls back to metadata
   * only), then runs the pure discoverCategory() below.
   */
  async discoverForProduct(organizationId: string, productId: string, userId: string): Promise<MarketCategoryResult> {
    const product = await this.productsService.findOne(organizationId, productId, userId);

    let websiteKnowledge: MarketCategoryDiscoveryInput['websiteKnowledge'];
    const websiteUrl = product.websiteUrl?.trim();
    if (websiteUrl) {
      try {
        websiteKnowledge = await this.productWebsiteKnowledgeService.buildKnowledge(websiteUrl);
      } catch (err) {
        this.logger.warn(
          `Website knowledge unavailable for product ${productId} during category discovery: ${(err as Error).message}`,
        );
      }
    }

    return this.discoverCategory({
      product: {
        name: product.name,
        shortDescription: product.shortDescription,
        productType: product.productType,
        primaryGoal: product.primaryGoal,
        targetMarkets: product.targetMarkets,
      },
      websiteKnowledge,
    });
  }

  discoverCategory(input: MarketCategoryDiscoveryInput): MarketCategoryResult {
    const evidenceTexts = this.collectEvidenceTexts(input);
    const clusterScores = this.scoreClusters(evidenceTexts);

    const ranked = Array.from(clusterScores.values())
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score || a.cluster.label.localeCompare(b.cluster.label));

    const topScore = ranked[0]?.score ?? 0;
    const secondScore = ranked[1]?.score ?? 0;
    const isAmbiguous = topScore > 0 && secondScore > 0 && secondScore / topScore >= AMBIGUITY_RATIO;

    const primaryCluster = topScore >= MIN_PRIMARY_SCORE ? ranked[0] : undefined;
    const primaryCategory = primaryCluster?.cluster.label;

    const subcategories = ranked
      .filter((c) => c !== primaryCluster)
      .slice(0, this.getMaxSubcategories())
      .map((c) => c.cluster.label);

    const contributingClusters = primaryCluster ? [primaryCluster, ...ranked.filter((c) => c !== primaryCluster).slice(0, this.getMaxSubcategories())] : [];

    const categoryTerms = this.dedupe(contributingClusters.flatMap((c) => Array.from(c.matchedTerms))).slice(
      0,
      this.getMaxTerms(),
    );

    const descriptors = this.dedupe(
      contributingClusters.map((c) => c.cluster.descriptor).filter((d): d is string => Boolean(d)),
    );

    const confidenceScore = this.computeConfidence(topScore, secondScore, isAmbiguous, evidenceTexts);

    const evidence: MarketCategoryEvidence = {
      productMetadata: this.dedupe(
        evidenceTexts.filter((e) => e.source === 'productMetadata').map((e) => e.text),
      ).slice(0, MAX_METADATA_EVIDENCE),
      websiteKnowledge: this.dedupe(
        evidenceTexts.filter((e) => e.source === 'websiteKnowledge').map((e) => e.text),
      ).slice(0, MAX_WEBSITE_EVIDENCE),
    };

    const missingSignals = this.buildMissingSignals(input, evidenceTexts);
    const warnings = isAmbiguous ? ['Market category is ambiguous based on available product evidence.'] : [];

    return {
      primaryCategory,
      subcategories,
      categoryTerms,
      descriptors,
      confidenceScore,
      evidence,
      missingSignals,
      warnings,
    };
  }

  private collectEvidenceTexts(input: MarketCategoryDiscoveryInput): EvidenceText[] {
    const { product, websiteKnowledge } = input;
    const texts: EvidenceText[] = [];

    if (product.name?.trim()) texts.push({ text: product.name.trim(), weight: 1, source: 'productMetadata' });
    if (product.shortDescription?.trim()) {
      texts.push({ text: product.shortDescription.trim(), weight: 4, source: 'productMetadata' });
    }
    if (product.productType?.trim()) texts.push({ text: product.productType.trim(), weight: 1, source: 'productMetadata' });
    for (const market of product.targetMarkets ?? []) {
      if (market?.trim()) texts.push({ text: market.trim(), weight: 1, source: 'productMetadata' });
    }

    if (websiteKnowledge) {
      for (const statement of websiteKnowledge.identity.keyStatements.slice(0, MAX_IDENTITY_STATEMENTS_SCANNED)) {
        texts.push({ text: statement, weight: 2, source: 'websiteKnowledge' });
      }
      for (const feature of websiteKnowledge.features.slice(0, MAX_FEATURES_SCANNED)) {
        texts.push({ text: feature, weight: 2, source: 'websiteKnowledge' });
      }
      for (const topic of websiteKnowledge.documentation.topics.slice(0, MAX_DOC_TOPICS_SCANNED)) {
        texts.push({ text: topic, weight: 1, source: 'websiteKnowledge' });
      }
      for (const fact of websiteKnowledge.documentation.technicalFacts.slice(0, MAX_DOC_FACTS_SCANNED)) {
        texts.push({ text: fact, weight: 1, source: 'websiteKnowledge' });
      }
    }

    return texts;
  }

  private scoreClusters(evidenceTexts: EvidenceText[]): Map<string, ClusterScore> {
    const scores = new Map<string, ClusterScore>();
    for (const cluster of CATEGORY_CLUSTERS) {
      scores.set(cluster.label, { cluster, score: 0, matchedTerms: new Set() });
    }

    for (const evidence of evidenceTexts) {
      const normalized = evidence.text.toLowerCase();
      for (const cluster of CATEGORY_CLUSTERS) {
        const matchedTerms = cluster.terms.filter((term) => this.containsTerm(normalized, term));
        if (matchedTerms.length === 0) continue;

        const entry = scores.get(cluster.label)!;
        entry.score += evidence.weight * Math.min(matchedTerms.length, 3);
        matchedTerms.forEach((term) => entry.matchedTerms.add(term));
      }
    }

    return scores;
  }

  private containsTerm(normalizedText: string, term: string): boolean {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(normalizedText);
  }

  private computeConfidence(
    topScore: number,
    secondScore: number,
    isAmbiguous: boolean,
    evidenceTexts: EvidenceText[],
  ): number {
    if (topScore < MIN_PRIMARY_SCORE) {
      return this.clamp(Math.round(topScore * 2), 0, 20);
    }

    let confidence = Math.round(topScore * 4);

    const hasMetadataEvidence = evidenceTexts.some((e) => e.source === 'productMetadata' && e.weight >= 4);
    const hasWebsiteEvidence = evidenceTexts.some((e) => e.source === 'websiteKnowledge');
    if (hasMetadataEvidence && hasWebsiteEvidence) confidence += 10;

    if (isAmbiguous) confidence -= 20;

    return this.clamp(confidence, 0, 100);
  }

  private buildMissingSignals(input: MarketCategoryDiscoveryInput, evidenceTexts: EvidenceText[]): string[] {
    const signals: string[] = [];
    const { product, websiteKnowledge } = input;

    if (!product.shortDescription?.trim()) {
      signals.push('Product description does not clearly state the market category.');
    }

    const featureLikeCount =
      (websiteKnowledge?.features.length ?? 0) +
      (websiteKnowledge?.documentation.topics.length ?? 0) +
      (websiteKnowledge?.documentation.technicalFacts.length ?? 0);
    if (featureLikeCount === 0) {
      signals.push('Product capabilities are too limited to determine a specific category.');
    }

    const hasWebsiteEvidence = evidenceTexts.some((e) => e.source === 'websiteKnowledge');
    if (!websiteKnowledge || !hasWebsiteEvidence) {
      signals.push('Website knowledge does not contain enough category-specific terminology.');
    }

    return signals;
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

  private getMaxSubcategories(): number {
    return this.getEnvNumber('MARKET_CATEGORY_MAX_SUBCATEGORIES', DEFAULT_MAX_SUBCATEGORIES);
  }

  private getMaxTerms(): number {
    return this.getEnvNumber('MARKET_CATEGORY_MAX_TERMS', DEFAULT_MAX_TERMS);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
