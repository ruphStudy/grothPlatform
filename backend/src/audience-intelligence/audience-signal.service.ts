import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductsService } from '../products/products.service';
import { MarketCategoryService } from '../market-intelligence/market-category.service';
import { ProductWebsiteKnowledgeService } from '../website-intelligence/product-website-knowledge.service';
import type {
  AudienceSignal,
  AudienceSignalCategory,
  AudienceSignalExtractionInput,
  AudienceSignalResult,
} from './types/audience-signal.types';

const DEFAULT_MAX_SIGNALS = 40;
const DEFAULT_MAX_EVIDENCE_PER_SIGNAL = 5;

// Evidence-text weight ⇒ base confidence for any signal it alone supports.
const HIGH_WEIGHT_THRESHOLD = 3;

interface EvidenceText {
  text: string;
  weight: number;
  source: string;
}

interface Cluster {
  label: string;
  terms: string[];
}

// Small, deliberately non-exhaustive vocabularies — clusters group related
// phrasing into one normalized label per category.
const ROLE_CLUSTERS: Cluster[] = [
  { label: 'Developers', terms: ['developer', 'developers', 'software developer', 'engineer', 'engineers', 'programmer', 'programmers'] },
  { label: 'Recruiters', terms: ['recruiter', 'recruiters', 'recruiting team', 'recruiting teams', 'talent acquisition'] },
  { label: 'Hiring Managers', terms: ['hiring manager', 'hiring managers'] },
  { label: 'HR Teams', terms: ['hr team', 'hr teams', 'human resources', 'hr professional', 'hr professionals', ' hr '] },
  { label: 'Candidates', terms: ['candidate', 'candidates', 'job seeker', 'job seekers'] },
  { label: 'Students', terms: ['student', 'students', 'learner', 'learners'] },
  { label: 'Teachers', terms: ['teacher', 'teachers', 'educator', 'educators', 'instructor', 'instructors'] },
  { label: 'Marketers', terms: ['marketer', 'marketers', 'marketing team', 'marketing teams'] },
  { label: 'Sales Representatives', terms: ['sales representative', 'sales representatives', 'sales rep', 'sales reps'] },
  { label: 'Sales Managers', terms: ['sales manager', 'sales managers'] },
  { label: 'Founders', terms: ['founder', 'founders'] },
  { label: 'Business Owners', terms: ['business owner', 'business owners'] },
  { label: 'Administrators', terms: ['administrator', 'administrators', 'admin team', 'admin teams'] },
  { label: 'Managers', terms: ['manager', 'managers'] },
  { label: 'Analysts', terms: ['analyst', 'analysts'] },
  { label: 'Designers', terms: ['designer', 'designers'] },
  { label: 'Support Agents', terms: ['support agent', 'support agents', 'customer support agent'] },
  { label: 'Finance Teams', terms: ['finance team', 'finance teams'] },
  { label: 'Operations Teams', terms: ['operations team', 'operations teams'] },
  { label: 'Healthcare Professionals', terms: ['healthcare professional', 'healthcare professionals', 'doctor', 'doctors', 'nurse', 'nurses', 'clinician', 'clinicians'] },
];

const USER_TYPE_CLUSTERS: Cluster[] = [
  { label: 'Individual User', terms: ['individual user', 'individual users', 'solo user', 'personal use'] },
  { label: 'Team', terms: ['team', 'teams'] },
  { label: 'Business', terms: ['business', 'businesses', 'company', 'companies'] },
  { label: 'Enterprise', terms: ['enterprise', 'enterprises'] },
  { label: 'Agency', terms: ['agency', 'agencies'] },
  { label: 'School / Institution', terms: ['school', 'schools', 'university', 'universities', 'institution', 'institutions'] },
  { label: 'Marketplace Seller', terms: ['seller', 'sellers'] },
  { label: 'Marketplace Buyer', terms: ['buyer', 'buyers'] },
  { label: 'Professional', terms: ['professional', 'professionals'] },
  { label: 'Consumer', terms: ['consumer', 'consumers'] },
];

const COMPANY_TYPE_CLUSTERS: Cluster[] = [
  { label: 'Startup', terms: ['startup', 'startups'] },
  { label: 'SMB', terms: ['smb', 'small and medium business', 'small and medium-sized business'] },
  { label: 'Enterprise', terms: ['enterprise', 'enterprises'] },
  { label: 'Agency', terms: ['agency', 'agencies'] },
  { label: 'Educational Institution', terms: ['educational institution', 'school', 'schools', 'university', 'universities'] },
  { label: 'E-commerce Business', terms: ['e-commerce business', 'ecommerce business', 'online store', 'online retailer'] },
  { label: 'Software Company', terms: ['software company', 'saas company'] },
  { label: 'Healthcare Organization', terms: ['healthcare organization', 'hospital', 'hospitals', 'clinic', 'clinics'] },
];

// Explicit signals only, per spec — no inference from product type alone.
const COMPANY_SIZE_CLUSTERS: Cluster[] = [
  { label: 'Startup', terms: ['startup', 'startups'] },
  { label: 'Small Business', terms: ['small business', 'small businesses', 'smb'] },
  { label: 'Mid-Market', terms: ['mid-market', 'midmarket', 'mid market'] },
  { label: 'Enterprise', terms: ['enterprise', 'large enterprise', 'large enterprises', 'enterprises'] },
];

const INDUSTRY_CLUSTERS: Cluster[] = [
  { label: 'Technology / Software', terms: ['software', 'technology', 'saas'] },
  { label: 'Education', terms: ['education', 'learning', 'training', 'school'] },
  { label: 'Recruiting / HR', terms: ['recruiting', 'recruitment', 'hiring', 'human resources', ' hr '] },
  { label: 'Marketing', terms: ['marketing'] },
  { label: 'Sales', terms: ['sales', 'crm'] },
  { label: 'Finance', terms: ['finance', 'accounting', 'fintech'] },
  { label: 'E-commerce', terms: ['ecommerce', 'e-commerce', 'marketplace', 'online store'] },
  { label: 'Healthcare', terms: ['healthcare', 'medical', 'clinical'] },
  { label: 'Real Estate', terms: ['real estate', 'property'] },
  { label: 'Logistics', terms: ['logistics', 'shipping', 'supply chain'] },
  { label: 'Customer Support', terms: ['customer support', 'helpdesk', 'customer service'] },
  { label: 'Developer Infrastructure', terms: ['developer platform', 'api', 'sdk', 'container', 'devops', 'cli'] },
];

const LIFECYCLE_CLUSTERS: Cluster[] = [
  { label: 'Awareness', terms: ['awareness', 'discover'] },
  { label: 'Evaluation', terms: ['evaluat', 'assess', 'review'] },
  { label: 'Onboarding', terms: ['onboard'] },
  { label: 'Training', terms: ['training', 'course'] },
  { label: 'Practice', terms: ['practice', 'rehearse'] },
  { label: 'Purchase', terms: ['purchase', 'buy now', 'checkout'] },
  { label: 'Implementation', terms: ['implement', 'setup', 'configure'] },
  { label: 'Daily Usage', terms: ['daily use', 'everyday', 'ongoing'] },
  { label: 'Reporting', terms: ['report', 'dashboard', 'analytics'] },
  { label: 'Optimization', terms: ['optimiz', 'improve'] },
  { label: 'Support', terms: ['support', 'help center'] },
];

const USE_CASE_CLUSTERS: Cluster[] = [
  { label: 'Interview Practice', terms: ['interview practice', 'mock interview', 'interview preparation'] },
  { label: 'Candidate Evaluation', terms: ['candidate evaluation', 'candidate assessment', 'answer evaluation'] },
  { label: 'Employee Training', terms: ['employee training', 'staff training'] },
  { label: 'Online Learning', terms: ['online learning', 'elearning', 'e-learning'] },
  { label: 'Marketing Automation', terms: ['marketing automation'] },
  { label: 'Lead Management', terms: ['lead management', 'lead generation'] },
  { label: 'Container Deployment', terms: ['container deployment', 'container orchestration'] },
  { label: 'Project Management', terms: ['project management'] },
];

// Buyer/purchasing-responsibility signals require stronger (weight >= 3)
// evidence — never inferred from feature lists or category context alone.
const BUYER_CLUSTERS: Cluster[] = [
  { label: 'Hiring Manager', terms: ['hiring manager', 'hiring managers'] },
  { label: 'HR Team', terms: ['hr team', 'hr teams'] },
  { label: 'Business Owner', terms: ['business owner', 'business owners'] },
  { label: 'Administrator', terms: ['administrator', 'administrators'] },
  { label: 'IT Team', terms: ['it team', 'it teams'] },
  { label: 'Procurement', terms: ['procurement'] },
];

const MARKETPLACE_TERMS = ['marketplace', 'buyers and sellers', 'connecting sellers', 'two-sided', 'two sided'];
const BUSINESS_AUDIENCE_TERMS = ['business', 'businesses', 'company', 'companies', 'team', 'teams', 'enterprise', 'enterprises', 'organization', 'organizations'];
const INDIVIDUAL_AUDIENCE_TERMS = ['individual', 'individuals', 'consumer', 'consumers', 'candidate', 'candidates', 'personal use'];

@Injectable()
export class AudienceSignalService {
  constructor(
    private readonly configService: ConfigService,
    private readonly productsService: ProductsService,
    private readonly productWebsiteKnowledgeService: ProductWebsiteKnowledgeService,
    private readonly marketCategoryService: MarketCategoryService,
  ) {}

  /**
   * Product-scoped orchestration. Tenant lookup first; website knowledge is
   * best-effort (falls back to metadata only on failure); market category
   * is computed via the pure discoverCategory() using the SAME product +
   * knowledge already fetched here — never discoverForProduct(), which
   * would redo the lookup and knowledge build (see Sprint 9H.1). No
   * competitor discovery, no Tavily, no website re-fetching.
   */
  async extractForProduct(organizationId: string, productId: string, userId: string): Promise<AudienceSignalResult> {
    const product = await this.productsService.findOne(organizationId, productId, userId);

    let websiteKnowledge: Awaited<ReturnType<ProductWebsiteKnowledgeService['buildKnowledge']>> | undefined;
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

    return this.extract({ product: productInput, websiteKnowledge, marketCategory });
  }

  extract(input: AudienceSignalExtractionInput): AudienceSignalResult {
    const allTexts = this.collectEvidenceTexts(input);
    const highWeightTexts = allTexts.filter((t) => t.weight >= HIGH_WEIGHT_THRESHOLD);

    const roleSignals = this.scanClusters(allTexts, ROLE_CLUSTERS, 'role');
    const userTypeSignals = this.scanClusters(allTexts, USER_TYPE_CLUSTERS, 'user_type');
    const companyTypeSignals = this.scanClusters(allTexts, COMPANY_TYPE_CLUSTERS, 'company_type');
    const companySizeSignals = this.scanClusters(allTexts, COMPANY_SIZE_CLUSTERS, 'company_size');
    const industrySignals = this.scanClusters(allTexts, INDUSTRY_CLUSTERS, 'industry');
    const lifecycleSignals = this.scanClusters(allTexts, LIFECYCLE_CLUSTERS, 'lifecycle');
    const useCaseSignals = this.scanClusters(allTexts, USE_CASE_CLUSTERS, 'use_case');
    const buyerSignals = this.scanClusters(highWeightTexts, BUYER_CLUSTERS, 'buyer');
    const businessModelSignals = this.deriveBusinessModelSignals(highWeightTexts);

    const allSignals = [
      ...roleSignals,
      ...userTypeSignals,
      ...companyTypeSignals,
      ...companySizeSignals,
      ...industrySignals,
      ...lifecycleSignals,
      ...useCaseSignals,
      ...buyerSignals,
      ...businessModelSignals,
    ]
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .slice(0, this.getMaxSignals());

    const pick = (category: AudienceSignalCategory) => allSignals.filter((s) => s.category === category).map((s) => s.label);

    const roles = pick('role');
    const buyers = pick('buyer');
    const companySizes = pick('company_size');
    const industries = pick('industry');
    const useCases = pick('use_case');

    return {
      signals: allSignals,
      roles,
      userTypes: pick('user_type'),
      companyTypes: pick('company_type'),
      companySizes,
      industries,
      lifecycleStages: pick('lifecycle'),
      useCases,
      buyerSignals: buyers,
      businessModelSignals: pick('business_model'),
      confidenceScore: this.computeOverallConfidence(allSignals, input, roles, useCases),
      missingSignals: this.buildMissingSignals(roles, buyers, companySizes, industries),
      warnings: this.buildWarnings(buyers, allTexts),
    };
  }

  private collectEvidenceTexts(input: AudienceSignalExtractionInput): EvidenceText[] {
    const { product, websiteKnowledge, marketCategory, positioningAudienceSignals } = input;
    const texts: EvidenceText[] = [];

    for (const market of product.targetMarkets ?? []) {
      if (market?.trim()) texts.push({ text: market.trim(), weight: 5, source: 'product_target_markets' });
    }
    for (const signal of positioningAudienceSignals ?? []) {
      if (signal?.trim()) texts.push({ text: signal.trim(), weight: 4, source: 'positioning_audience_signals' });
    }
    if (product.shortDescription?.trim()) {
      texts.push({ text: product.shortDescription.trim(), weight: 4, source: 'product_short_description' });
    }
    if (product.productType?.trim()) texts.push({ text: product.productType.trim(), weight: 1, source: 'product_metadata' });
    if (product.primaryGoal?.trim()) texts.push({ text: product.primaryGoal.trim(), weight: 1, source: 'product_metadata' });

    if (websiteKnowledge) {
      for (const s of websiteKnowledge.identity.keyStatements.slice(0, 10)) {
        texts.push({ text: s, weight: 3, source: 'website_identity' });
      }
      for (const f of websiteKnowledge.features.slice(0, 15)) {
        texts.push({ text: f, weight: 2, source: 'website_features' });
      }
      for (const t of websiteKnowledge.documentation.topics.slice(0, 10)) {
        texts.push({ text: t, weight: 1, source: 'website_documentation' });
      }
      for (const f of websiteKnowledge.documentation.technicalFacts.slice(0, 10)) {
        texts.push({ text: f, weight: 1, source: 'website_documentation' });
      }
    }

    if (marketCategory) {
      if (marketCategory.primaryCategory) texts.push({ text: marketCategory.primaryCategory, weight: 1, source: 'market_category' });
      for (const s of marketCategory.subcategories) texts.push({ text: s, weight: 1, source: 'market_category' });
      for (const d of marketCategory.descriptors) texts.push({ text: d, weight: 1, source: 'market_category' });
    }

    return texts;
  }

  private scanClusters(texts: EvidenceText[], clusters: Cluster[], category: AudienceSignalCategory): AudienceSignal[] {
    const signals: AudienceSignal[] = [];
    for (const cluster of clusters) {
      let maxWeight = 0;
      const snippets: string[] = [];
      const sources = new Set<string>();
      for (const evidence of texts) {
        const padded = ` ${evidence.text.toLowerCase()} `;
        if (cluster.terms.some((term) => padded.includes(term))) {
          maxWeight = Math.max(maxWeight, evidence.weight);
          snippets.push(evidence.text);
          sources.add(evidence.source);
        }
      }
      if (maxWeight === 0) continue;
      const dedupedSnippets = this.dedupe(snippets).slice(0, this.getMaxEvidencePerSignal());
      signals.push({
        label: cluster.label,
        category,
        confidenceScore: this.scoreForWeight(maxWeight, dedupedSnippets.length),
        evidence: dedupedSnippets,
        sources: Array.from(sources),
      });
    }
    return signals;
  }

  private deriveBusinessModelSignals(texts: EvidenceText[]): AudienceSignal[] {
    const match = (terms: string[]) => {
      let maxWeight = 0;
      const snippets: string[] = [];
      const sources = new Set<string>();
      for (const t of texts) {
        const padded = ` ${t.text.toLowerCase()} `;
        if (terms.some((term) => padded.includes(term))) {
          maxWeight = Math.max(maxWeight, t.weight);
          snippets.push(t.text);
          sources.add(t.source);
        }
      }
      return { maxWeight, snippets, sources };
    };

    const marketplace = match(MARKETPLACE_TERMS);
    if (marketplace.maxWeight > 0) {
      const snippets = this.dedupe(marketplace.snippets).slice(0, this.getMaxEvidencePerSignal());
      return [
        {
          label: 'Marketplace / Two-sided',
          category: 'business_model',
          confidenceScore: this.scoreForWeight(marketplace.maxWeight, snippets.length),
          evidence: snippets,
          sources: Array.from(marketplace.sources),
        },
      ];
    }

    const business = match(BUSINESS_AUDIENCE_TERMS);
    const individual = match(INDIVIDUAL_AUDIENCE_TERMS);
    const signals: AudienceSignal[] = [];

    if (business.maxWeight > 0 && individual.maxWeight > 0) {
      const snippets = this.dedupe([...business.snippets, ...individual.snippets]).slice(0, this.getMaxEvidencePerSignal());
      signals.push({
        label: 'B2B2C',
        category: 'business_model',
        confidenceScore: this.scoreForWeight(Math.min(business.maxWeight, individual.maxWeight), snippets.length),
        evidence: snippets,
        sources: Array.from(new Set([...business.sources, ...individual.sources])),
      });
    } else if (business.maxWeight > 0) {
      const snippets = this.dedupe(business.snippets).slice(0, this.getMaxEvidencePerSignal());
      signals.push({
        label: 'B2B',
        category: 'business_model',
        confidenceScore: this.scoreForWeight(business.maxWeight, snippets.length),
        evidence: snippets,
        sources: Array.from(business.sources),
      });
    } else if (individual.maxWeight > 0) {
      const snippets = this.dedupe(individual.snippets).slice(0, this.getMaxEvidencePerSignal());
      signals.push({
        label: 'B2C',
        category: 'business_model',
        confidenceScore: this.scoreForWeight(individual.maxWeight, snippets.length),
        evidence: snippets,
        sources: Array.from(individual.sources),
      });
    }

    return signals;
  }

  private computeOverallConfidence(
    signals: AudienceSignal[],
    input: AudienceSignalExtractionInput,
    roles: string[],
    useCases: string[],
  ): number {
    let score = 0;
    const strongSignals = signals.filter((s) => s.confidenceScore >= 60).length;
    score += Math.min(40, strongSignals * 8);

    const distinctSources = new Set(signals.flatMap((s) => s.sources)).size;
    score += Math.min(20, distinctSources * 5);

    const hasExplicitTargetEvidence =
      (input.product.targetMarkets?.length ?? 0) > 0 || (input.positioningAudienceSignals?.length ?? 0) > 0;
    if (hasExplicitTargetEvidence) score += 15;

    if (roles.length > 0 && useCases.length > 0) score += 15;
    if (input.websiteKnowledge) score += 10;

    return this.clamp(Math.round(score), 0, 100);
  }

  private buildMissingSignals(roles: string[], buyers: string[], companySizes: string[], industries: string[]): string[] {
    const missing: string[] = [];
    if (roles.length === 0) missing.push('Primary end-user roles are not clearly stated.');
    if (buyers.length === 0) missing.push('Buyer or purchasing-role evidence was not found.');
    if (companySizes.length === 0) missing.push('Company-size targeting is not specified.');
    if (industries.length === 0) missing.push('Target industries are not clearly stated.');
    return missing;
  }

  private buildWarnings(buyers: string[], texts: EvidenceText[]): string[] {
    const warnings: string[] = [];
    const hasStrongEvidence = texts.some((t) => t.weight >= HIGH_WEIGHT_THRESHOLD);
    if (!hasStrongEvidence) warnings.push('Audience intelligence is based primarily on inferred product/category signals.');
    if (buyers.length === 0) warnings.push('Buyer and end-user roles may differ; buyer evidence is limited.');
    if (texts.length <= 1) warnings.push('Audience evidence is sparse.');
    return this.dedupe(warnings);
  }

  private scoreForWeight(maxWeight: number, count: number): number {
    const base: Record<number, number> = { 5: 90, 4: 75, 3: 60, 2: 50, 1: 30 };
    const bonus = Math.min(count - 1, 4) * 3;
    return this.clamp((base[maxWeight] ?? 30) + bonus, 0, 100);
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

  private getMaxSignals(): number {
    return this.getEnvNumber('AUDIENCE_SIGNAL_MAX_SIGNALS', DEFAULT_MAX_SIGNALS);
  }

  private getMaxEvidencePerSignal(): number {
    return this.getEnvNumber('AUDIENCE_SIGNAL_MAX_EVIDENCE_PER_SIGNAL', DEFAULT_MAX_EVIDENCE_PER_SIGNAL);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
