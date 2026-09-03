import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AudiencePainPoint } from '../audience-intelligence/types/audience-pain-point.types';
import type {
  KeywordIntent,
  KeywordSignal,
  KeywordSignalExtractionInput,
  KeywordSignalResult,
  KeywordSignalSource,
} from './types/keyword-signal.types';

const DEFAULT_MAX_WORDS = 8;
const DEFAULT_MAX_COMMERCIAL_VARIANTS = 10;
const DEFAULT_MAX_BASE_CONCEPTS = 40;
const DEFAULT_MAX_KEYWORDS = 100;
const DEFAULT_MAX_LONG_TAIL = 30;

// Rejected when they appear as the ENTIRE phrase (single word) — still fine
// inside a longer, meaningful phrase (e.g. "interview preparation software").
const GENERIC_ALONE = new Set(['platform', 'software', 'solution', 'system', 'tool', 'service', 'app']);

// Genuinely category-specific single tokens are allowed on their own.
const SINGLE_TOKEN_ALLOW = new Set(['crm', 'devops', 'fintech', 'saas', 'erp', 'cms', 'api']);

// Navigation / CTA labels — never useful keyword candidates.
const NOISE_PHRASES = new Set([
  'learn more', 'get started', 'sign up now', 'contact us', 'read more', 'click here',
  'home', 'about', 'about us', 'contact', 'sign in', 'login', 'log in', 'faq', 'blog', 'careers',
]);

const ACRONYM_CASING: Record<string, string> = {
  ai: 'AI', b2b: 'B2B', b2c: 'B2C', crm: 'CRM', hr: 'HR', api: 'API',
  saas: 'SaaS', seo: 'SEO', roi: 'ROI', it: 'IT', devops: 'DevOps', fintech: 'FinTech', erp: 'ERP', cms: 'CMS',
};

const PAIN_FOCUS_STRIP_WORDS = new Set(['manual', 'slow', 'inconsistent', 'poor', 'lack', 'of', 'or', 'and', 'the', 'a', 'an']);

interface RawCandidate {
  normalized: string;
  source: KeywordSignalSource;
  weight: number;
  intents: KeywordIntent[];
  evidence?: string;
  relatedUseCases?: string[];
  relatedSegments?: string[];
  warnings?: string[];
}

@Injectable()
export class KeywordSignalService {
  constructor(private readonly configService: ConfigService) {}

  extract(input: KeywordSignalExtractionInput): KeywordSignalResult {
    const raw: RawCandidate[] = [
      ...this.collectDirectConcepts(input),
      ...this.buildAudienceCombinations(input),
      ...this.buildCommercialVariants(input),
      ...this.buildPainDerivedCandidates(input),
      ...this.buildPricingIntentBooster(input),
    ];

    const merged = this.dedupeAndMerge(raw)
      .sort((a, b) => b.confidenceScore - a.confidenceScore || a.normalizedKeyword.localeCompare(b.normalizedKeyword))
      .slice(0, this.getMaxKeywords());

    const productKeywords = this.pick(merged, (k) =>
      k.sources.some((s) => s === 'market_category' || s === 'market_term' || s === 'product_name' || s === 'product_description'),
    );
    const featureKeywords = this.pick(merged, (k) => k.sources.includes('feature'));
    const audienceKeywords = this.pick(merged, (k) => k.sources.includes('audience'));
    const problemKeywords = this.pick(merged, (k) => k.sources.includes('pain_point'));
    const commercialKeywords = this.pick(merged, (k) => k.intent.includes('commercial') || k.intent.includes('transactional'));
    const longTailKeywords = merged
      .filter((k) => k.normalizedKeyword.split(' ').length >= 4)
      .slice(0, this.getMaxLongTail())
      .map((k) => k.keyword);

    return {
      keywords: merged,
      productKeywords,
      featureKeywords,
      audienceKeywords,
      problemKeywords,
      commercialKeywords,
      longTailKeywords,
      confidenceScore: this.computeOverallConfidence(input, merged),
      missingSignals: this.buildMissingSignals(input, problemKeywords),
      warnings: this.buildWarnings(input, problemKeywords),
      generatedAt: new Date(),
    };
  }

  private pick(keywords: KeywordSignal[], predicate: (k: KeywordSignal) => boolean): string[] {
    return keywords.filter(predicate).map((k) => k.keyword);
  }

  // ---------------------------------------------------------------------
  // Candidate generation
  // ---------------------------------------------------------------------

  private collectDirectConcepts(input: KeywordSignalExtractionInput): RawCandidate[] {
    const { product, websiteKnowledge, marketCategory, audienceSignals, segments, jtbd } = input;
    const concepts: { text: string; source: KeywordSignalSource; weight: number }[] = [];

    if (marketCategory?.primaryCategory) concepts.push({ text: marketCategory.primaryCategory, source: 'market_category', weight: 5 });
    for (const s of marketCategory?.subcategories ?? []) concepts.push({ text: s, source: 'market_category', weight: 4 });
    for (const t of marketCategory?.categoryTerms ?? []) concepts.push({ text: t, source: 'market_term', weight: 4 });
    for (const d of marketCategory?.descriptors ?? []) concepts.push({ text: d, source: 'market_category', weight: 3 });

    for (const f of (websiteKnowledge?.features ?? []).slice(0, 20)) concepts.push({ text: f, source: 'feature', weight: 5 });

    const useCases = new Set<string>([
      ...(audienceSignals?.useCases ?? []),
      ...(segments?.segments.flatMap((s) => s.useCases) ?? []),
    ]);
    for (const u of useCases) concepts.push({ text: u, source: 'use_case', weight: 5 });

    const audienceTerms = new Set<string>([...(audienceSignals?.roles ?? []), ...(audienceSignals?.userTypes ?? [])]);
    for (const a of audienceTerms) concepts.push({ text: a, source: 'audience', weight: 4 });

    if (product.shortDescription) concepts.push({ text: product.shortDescription, source: 'product_description', weight: 4 });
    if (product.name) concepts.push({ text: product.name, source: 'product_name', weight: 2 });

    if (websiteKnowledge?.identity.title) concepts.push({ text: websiteKnowledge.identity.title, source: 'website_identity', weight: 3 });
    if (websiteKnowledge?.identity.metaDescription) {
      concepts.push({ text: websiteKnowledge.identity.metaDescription, source: 'website_identity', weight: 3 });
    }
    for (const k of (websiteKnowledge?.identity.keyStatements ?? []).slice(0, 5)) {
      concepts.push({ text: k, source: 'website_identity', weight: 2 });
    }

    // JTBD contributes only its structured related use cases — never the
    // free-form job statement/motivation text — to stay conservative.
    for (const jobId of Object.values(jtbd?.primaryJobIdBySegment ?? {})) {
      const job = jtbd?.jobs.find((j) => j.id === jobId);
      for (const u of job?.relatedUseCases ?? []) concepts.push({ text: u, source: 'jtbd', weight: 3 });
    }

    return concepts
      .slice(0, this.getMaxBaseConcepts())
      .map((c) => this.toCandidate(c.text, c.source, c.weight))
      .filter((c): c is RawCandidate => c !== null);
  }

  private buildAudienceCombinations(input: KeywordSignalExtractionInput): RawCandidate[] {
    const { marketCategory, audienceSignals, segments } = input;
    const baseTerms = this.dedupe([
      ...(marketCategory?.primaryCategory ? [marketCategory.primaryCategory] : []),
      ...(marketCategory?.subcategories ?? []),
      ...(audienceSignals?.useCases ?? []),
      ...(segments?.segments.flatMap((s) => s.useCases) ?? []),
    ]).slice(0, 3);
    const audiences = this.dedupe([...(audienceSignals?.roles ?? []), ...(audienceSignals?.userTypes ?? [])]).slice(0, 3);

    const candidates: RawCandidate[] = [];
    for (const base of baseTerms) {
      for (const audience of audiences) {
        const phrase = `${base} for ${audience}`;
        const candidate = this.toCandidate(phrase, 'audience', 4, {
          intents: ['audience_specific', 'solution'],
          relatedUseCases: [base],
        });
        if (candidate) candidates.push(candidate);
      }
    }
    return candidates;
  }

  private buildCommercialVariants(input: KeywordSignalExtractionInput): RawCandidate[] {
    const { marketCategory } = input;
    const strongestTerms = this.dedupe([
      ...(marketCategory?.primaryCategory ? [marketCategory.primaryCategory] : []),
      ...(marketCategory?.subcategories ?? []),
    ]).slice(0, this.getMaxCommercialVariants());

    const candidates: RawCandidate[] = [];
    for (const term of strongestTerms) {
      const candidate = this.toCandidate(`best ${term}`, 'market_category', 3, { intents: ['commercial', 'comparison'] });
      if (candidate) candidates.push(candidate);
    }
    return candidates;
  }

  private buildPainDerivedCandidates(input: KeywordSignalExtractionInput): RawCandidate[] {
    const strongest = this.strongestPainPoints(input.painPoints);
    const candidates: RawCandidate[] = [];

    for (const pain of strongest) {
      const focus = this.deriveFocus(pain);
      if (!focus) continue;
      const titleLower = pain.title.toLowerCase();

      let phraseA: string;
      if (titleLower.includes('manual')) phraseA = `reduce manual ${focus}`;
      else if (titleLower.includes('slow')) phraseA = `reduce slow ${focus}`;
      else phraseA = `improve ${focus}`;

      const shared = {
        intents: ['problem'] as KeywordIntent[],
        relatedUseCases: pain.relatedUseCases,
        relatedSegments: [pain.segmentId],
        warnings: ['Derived from an inferred audience pain-point hypothesis.'],
      };

      const a = this.toCandidate(phraseA, 'pain_point', 2, shared);
      if (a) candidates.push(a);
      const b = this.toCandidate(`improve ${focus} efficiency`, 'pain_point', 2, shared);
      if (b) candidates.push(b);
    }
    return candidates;
  }

  private buildPricingIntentBooster(input: KeywordSignalExtractionInput): RawCandidate[] {
    const hasPricingEvidence = (input.websiteKnowledge?.pricing.signals.length ?? 0) > 0;
    if (!hasPricingEvidence || !input.marketCategory?.primaryCategory) return [];
    const candidate = this.toCandidate(input.marketCategory.primaryCategory, 'pricing', 1, { intents: ['transactional'] });
    return candidate ? [candidate] : [];
  }

  private strongestPainPoints(painPoints?: KeywordSignalExtractionInput['painPoints']): AudiencePainPoint[] {
    if (!painPoints) return [];
    return painPoints.strongestPainPointIds
      .map((id) => painPoints.painPoints.find((p) => p.id === id))
      .filter((p): p is AudiencePainPoint => !!p);
  }

  private deriveFocus(pain: AudiencePainPoint): string | undefined {
    if (pain.relatedUseCases[0]) return this.normalizeText(pain.relatedUseCases[0]);
    const words = pain.title.split(' ').filter((w) => !PAIN_FOCUS_STRIP_WORDS.has(w.toLowerCase()));
    const focus = words.join(' ').trim();
    return focus ? this.normalizeText(focus) : undefined;
  }

  // ---------------------------------------------------------------------
  // Normalization / quality filtering
  // ---------------------------------------------------------------------

  private toCandidate(
    rawText: string,
    source: KeywordSignalSource,
    weight: number,
    extra?: { intents?: KeywordIntent[]; relatedUseCases?: string[]; relatedSegments?: string[]; warnings?: string[] },
  ): RawCandidate | null {
    const normalized = this.normalizeText(rawText);
    if (!this.isQualityPhrase(normalized)) return null;
    const intents = this.dedupeIntents([...(extra?.intents ?? []), ...this.classifyIntent(normalized, source)]);
    return {
      normalized,
      source,
      weight,
      intents,
      evidence: rawText.trim(),
      relatedUseCases: extra?.relatedUseCases,
      relatedSegments: extra?.relatedSegments,
      warnings: extra?.warnings,
    };
  }

  private normalizeText(raw: string): string {
    let s = raw.trim().toLowerCase();
    s = s.replace(/[’‘“”"]/g, '');
    s = s.replace(/[–—]/g, '-');
    s = s.replace(/-+/g, '-');
    s = s.replace(/\s+/g, ' ');
    s = s.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
    return s.trim();
  }

  private isQualityPhrase(normalized: string): boolean {
    if (!normalized || normalized.length < 2) return false;
    if (NOISE_PHRASES.has(normalized)) return false;
    if (/[.!?]/.test(normalized)) return false;

    const words = normalized.split(' ').filter(Boolean);
    if (words.length === 0) return false;
    if (words.length > this.getMaxWords()) return false;

    if (words.length === 1) {
      if (GENERIC_ALONE.has(normalized)) return false;
      if (!SINGLE_TOKEN_ALLOW.has(normalized)) return false;
    }
    return true;
  }

  private toDisplayKeyword(normalized: string): string {
    return normalized
      .split(' ')
      .map((w) => ACRONYM_CASING[w] ?? w)
      .join(' ');
  }

  private classifyIntent(normalized: string, source: KeywordSignalSource): KeywordIntent[] {
    const intents = new Set<KeywordIntent>();
    const has = (terms: string[]) => terms.some((t) => normalized.includes(t));

    if (has(['how', 'guide', 'learn', 'practice', 'tips', 'what is'])) intents.add('informational');
    if (has(['difficulty', 'reduce', 'improve', 'fix', 'manual', 'slow', 'inconsistent', 'lack', 'poor'])) intents.add('problem');
    if (has(['software', 'platform', 'tool', 'solution', 'service', 'pricing', 'best', 'alternative'])) intents.add('commercial');
    if (has(['buy', 'pricing', 'plans', 'free trial', 'sign up'])) intents.add('transactional');
    if (has(['best', 'alternative', 'alternatives', 'vs', 'comparison'])) intents.add('comparison');
    if (source === 'market_category' || source === 'market_term' || source === 'feature') intents.add('solution');
    if (source === 'audience' || has([' for '])) intents.add('audience_specific');

    if (intents.size === 0) intents.add('informational');
    return Array.from(intents);
  }

  private dedupeIntents(intents: KeywordIntent[]): KeywordIntent[] {
    return Array.from(new Set(intents));
  }

  // ---------------------------------------------------------------------
  // Dedup / merge
  // ---------------------------------------------------------------------

  private dedupeAndMerge(raw: RawCandidate[]): KeywordSignal[] {
    const map = new Map<string, KeywordSignal>();

    for (const c of raw) {
      const confidence = this.scoreConfidence(c.weight, c.source);
      const existing = map.get(c.normalized);

      if (!existing) {
        map.set(c.normalized, {
          keyword: this.toDisplayKeyword(c.normalized),
          normalizedKeyword: c.normalized,
          sources: [c.source],
          intent: c.intents,
          confidenceScore: confidence,
          evidence: c.evidence ? [c.evidence] : [],
          relatedSegments: c.relatedSegments,
          relatedUseCases: c.relatedUseCases,
          warnings: c.warnings ?? [],
        });
        continue;
      }

      existing.sources = Array.from(new Set([...existing.sources, c.source]));
      existing.intent = Array.from(new Set([...existing.intent, ...c.intents]));
      if (c.evidence) existing.evidence = this.dedupe([...existing.evidence, c.evidence]).slice(0, 5);
      if (c.relatedUseCases?.length) {
        existing.relatedUseCases = Array.from(new Set([...(existing.relatedUseCases ?? []), ...c.relatedUseCases]));
      }
      if (c.relatedSegments?.length) {
        existing.relatedSegments = Array.from(new Set([...(existing.relatedSegments ?? []), ...c.relatedSegments]));
      }
      if (c.warnings?.length) existing.warnings = this.dedupe([...existing.warnings, ...c.warnings]);

      const distinctSourceBonus = Math.min(15, (existing.sources.length - 1) * 7);
      existing.confidenceScore = this.clamp(Math.max(existing.confidenceScore, confidence) + distinctSourceBonus, 0, 100);
    }

    return Array.from(map.values());
  }

  private scoreConfidence(weight: number, source: KeywordSignalSource): number {
    const base: Record<number, number> = { 5: 80, 4: 65, 3: 55, 2: 40, 1: 25 };
    let score = base[weight] ?? 30;
    if (source === 'pain_point') score = Math.min(score, 35);
    return this.clamp(score, 0, 100);
  }

  // ---------------------------------------------------------------------
  // Overall confidence / missing signals / warnings
  // ---------------------------------------------------------------------

  private computeOverallConfidence(input: KeywordSignalExtractionInput, keywords: KeywordSignal[]): number {
    let score = 0;
    score += Math.round((input.marketCategory?.confidenceScore ?? 0) * 0.25);
    score += Math.round((input.audienceSignals?.confidenceScore ?? 0) * 0.2);
    if (input.websiteKnowledge) score += 15;

    const featureCount = input.websiteKnowledge?.features.length ?? 0;
    score += Math.min(15, featureCount * 3);

    const useCaseCount = new Set([
      ...(input.audienceSignals?.useCases ?? []),
      ...(input.segments?.segments.flatMap((s) => s.useCases) ?? []),
    ]).size;
    score += Math.min(15, useCaseCount * 5);

    const distinctSources = new Set(keywords.flatMap((k) => k.sources)).size;
    score += Math.min(10, distinctSources * 2);

    return this.clamp(Math.round(score), 0, 100);
  }

  private buildMissingSignals(input: KeywordSignalExtractionInput, problemKeywords: string[]): string[] {
    const missing: string[] = [];
    const hasCategoryTerms =
      !!input.marketCategory?.primaryCategory ||
      (input.marketCategory?.subcategories.length ?? 0) > 0 ||
      (input.marketCategory?.categoryTerms.length ?? 0) > 0;
    if (!hasCategoryTerms) missing.push('Product category terminology is limited.');
    if ((input.websiteKnowledge?.features.length ?? 0) === 0) missing.push('Explicit product features are limited.');
    const audienceTermCount = (input.audienceSignals?.roles.length ?? 0) + (input.audienceSignals?.userTypes.length ?? 0);
    if (audienceTermCount === 0) missing.push('Audience-specific keyword evidence is limited.');
    if (problemKeywords.length > 0) missing.push('Problem-oriented keywords rely on inferred pain-point hypotheses.');
    return missing;
  }

  private buildWarnings(input: KeywordSignalExtractionInput, problemKeywords: string[]): string[] {
    const warnings: string[] = [
      'Keyword candidates are derived from product/audience evidence and do not include search-volume, CPC, competition, or ranking data.',
    ];
    if (problemKeywords.length > 0) {
      warnings.push('Problem-oriented keywords include inferred audience pain hypotheses and require validation.');
    }
    const audienceTermCount = (input.audienceSignals?.roles.length ?? 0) + (input.audienceSignals?.userTypes.length ?? 0);
    if (audienceTermCount === 0) warnings.push('Audience-specific keyword confidence is limited.');
    return this.dedupe(warnings);
  }

  // ---------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------

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

  private getMaxWords(): number {
    return this.getEnvNumber('KEYWORD_SIGNAL_MAX_WORDS', DEFAULT_MAX_WORDS);
  }

  private getMaxCommercialVariants(): number {
    return this.getEnvNumber('KEYWORD_SIGNAL_MAX_COMMERCIAL_VARIANTS', DEFAULT_MAX_COMMERCIAL_VARIANTS);
  }

  private getMaxBaseConcepts(): number {
    return this.getEnvNumber('KEYWORD_SIGNAL_MAX_BASE_CONCEPTS', DEFAULT_MAX_BASE_CONCEPTS);
  }

  private getMaxKeywords(): number {
    return this.getEnvNumber('KEYWORD_SIGNAL_MAX_KEYWORDS', DEFAULT_MAX_KEYWORDS);
  }

  private getMaxLongTail(): number {
    return this.getEnvNumber('KEYWORD_SIGNAL_MAX_LONG_TAIL', DEFAULT_MAX_LONG_TAIL);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
