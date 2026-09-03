import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CompetitorKeywordGapResult } from './types/competitor-keyword-gap.types';
import type { KeywordClusterResult } from './types/keyword-cluster.types';
import { KeywordIntentService } from './keyword-intent.service';
import type { KeywordIntentResult } from './types/keyword-intent.types';
import type { LongTailExpansionType, LongTailKeyword, KeywordLongTailResult } from './types/keyword-long-tail.types';
import type { KeywordOpportunityResult } from './types/keyword-opportunity.types';
import type { KeywordSignal, KeywordSignalResult, KeywordSignalSource } from './types/keyword-signal.types';

const DEFAULT_MAX_BASES = 20;
const DEFAULT_MAX_PER_BASE = 5;
const DEFAULT_MAX_RESULTS = 60;
const STRONGEST_COUNT = 10;

const GENERIC_TOKENS = new Set(['software', 'platform', 'tool', 'solution', 'service']);

const FEATURE_LIKE_SOURCES = new Set<KeywordSignalSource>(['market_category', 'market_term', 'use_case', 'feature']);

const PATTERN_TYPE_WEIGHT: Record<LongTailExpansionType, number> = {
  comparison: 85,
  intent: 80,
  feature: 75,
  audience: 75,
  use_case: 70,
  problem: 60,
  competitor_gap: 55,
};

const DISCLAIMER = 'Long-tail keywords are deterministic candidate expansions and do not include verified search-demand or ranking data.';

export interface KeywordLongTailInput {
  signals: KeywordSignalResult;
  intents: KeywordIntentResult;
  clusters: KeywordClusterResult;
  opportunities: KeywordOpportunityResult;
  competitorGaps?: CompetitorKeywordGapResult;
}

interface BaseCandidate {
  keyword: string;
  normalizedKeyword: string;
  baseStrength: number;
  baseConfidence: number;
  source: 'opportunity' | 'cluster' | 'signal' | 'gap';
  sources: KeywordSignalSource[];
  relatedSegments: string[];
  relatedUseCases: string[];
  competitorSupport?: number;
}

interface RawCandidate {
  keyword: string;
  normalizedKeyword: string;
  baseKeyword: string;
  expansionType: LongTailExpansionType;
  opportunityScore: number;
  confidenceScore: number;
  relatedSegments: string[];
  relatedUseCases: string[];
  reasons: string[];
  warnings: string[];
  sources: KeywordSignalSource[];
}

@Injectable()
export class KeywordLongTailService {
  constructor(
    private readonly configService: ConfigService,
    private readonly keywordIntentService: KeywordIntentService,
  ) {}

  expand(input: KeywordLongTailInput): KeywordLongTailResult {
    const existingNormalized = new Set(input.signals.keywords.map((k) => k.normalizedKeyword));

    const bases = this.selectBases(input);
    const audienceLabels = this.shortLabelsFor(input.signals, 'audience', 3);
    const useCaseLabels = this.shortLabelsFor(input.signals, 'use_case', 4);
    const problemConcepts = this.dedupe(
      input.signals.problemKeywords.map((k) => k.replace(/^(reduce|improve|fix)\s+/i, '').trim()).filter(Boolean),
    ).slice(0, 3);

    const perBaseCandidates: RawCandidate[] = [];
    for (const base of bases) {
      const generated = this.generateForBase(base, audienceLabels, useCaseLabels, problemConcepts);
      const scored = generated
        .map((g) => this.scoreCandidate(g, base))
        .filter((c): c is RawCandidate => c !== null && !existingNormalized.has(c.normalizedKeyword));
      scored.sort((a, b) => b.opportunityScore - a.opportunityScore);
      perBaseCandidates.push(...scored.slice(0, this.getMaxPerBase()));
    }

    // Global de-dup across bases (first occurrence — already sorted best-first per base — wins).
    const seen = new Set<string>();
    const deduped: RawCandidate[] = [];
    for (const c of perBaseCandidates) {
      if (seen.has(c.normalizedKeyword)) continue;
      seen.add(c.normalizedKeyword);
      deduped.push(c);
    }
    deduped.sort((a, b) => b.opportunityScore - a.opportunityScore || a.keyword.localeCompare(b.keyword));
    const bounded = deduped.slice(0, this.getMaxResults());

    const profileByNormalized = this.classifyCandidates(bounded);

    const keywords: LongTailKeyword[] = bounded.map((c) => {
      const profile = profileByNormalized.get(c.normalizedKeyword);
      return {
        keyword: c.keyword,
        normalizedKeyword: c.normalizedKeyword,
        baseKeyword: c.baseKeyword,
        expansionType: c.expansionType,
        primaryIntent: profile?.primaryIntent ?? 'informational',
        funnelStage: profile?.funnelStage ?? 'awareness',
        relatedSegments: c.relatedSegments,
        relatedUseCases: c.relatedUseCases,
        opportunityScore: c.opportunityScore,
        confidenceScore: c.confidenceScore,
        reasons: c.reasons,
        warnings: c.warnings,
      };
    });

    const strongestKeywords = keywords.slice(0, STRONGEST_COUNT).map((k) => k.keyword);
    const confidenceScore = keywords.length ? Math.round(keywords.reduce((sum, k) => sum + k.confidenceScore, 0) / keywords.length) : 0;

    const warnings = [DISCLAIMER];
    if (!input.competitorGaps) {
      warnings.push('Competitor-gap-derived expansions were not included because competitor data was unavailable.');
    }

    return {
      keywords,
      strongestKeywords,
      confidenceScore,
      warnings: this.dedupe(warnings),
      generatedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------
  // Base selection
  // ---------------------------------------------------------------------

  private selectBases(input: KeywordLongTailInput): BaseCandidate[] {
    const signalByKeyword = new Map(input.signals.keywords.map((k) => [k.keyword, k]));
    const pool = new Map<string, BaseCandidate>();

    const add = (candidate: BaseCandidate) => {
      const existing = pool.get(candidate.normalizedKeyword);
      if (!existing || candidate.baseStrength > existing.baseStrength) pool.set(candidate.normalizedKeyword, candidate);
    };

    for (const o of input.opportunities.opportunities) {
      if (o.tier !== 'high' && o.tier !== 'medium') continue;
      const sig = signalByKeyword.get(o.keyword);
      add({
        keyword: o.keyword,
        normalizedKeyword: o.normalizedKeyword,
        baseStrength: o.opportunityScore,
        baseConfidence: o.confidenceScore,
        source: 'opportunity',
        sources: sig?.sources ?? [],
        relatedSegments: sig?.relatedSegments ?? [],
        relatedUseCases: sig?.relatedUseCases ?? [],
      });
    }

    for (const c of input.clusters.clusters) {
      if (c.coherenceScore < 60) continue;
      const sig = signalByKeyword.get(c.primaryKeyword);
      add({
        keyword: c.primaryKeyword,
        normalizedKeyword: sig?.normalizedKeyword ?? c.primaryKeyword.toLowerCase(),
        baseStrength: c.confidenceScore,
        baseConfidence: c.confidenceScore,
        source: 'cluster',
        sources: sig?.sources ?? [],
        relatedSegments: c.relatedSegments,
        relatedUseCases: c.relatedUseCases,
      });
    }

    for (const k of input.signals.keywords) {
      if (k.confidenceScore < 65) continue;
      if (!k.sources.some((s) => FEATURE_LIKE_SOURCES.has(s))) continue;
      add({
        keyword: k.keyword,
        normalizedKeyword: k.normalizedKeyword,
        baseStrength: k.confidenceScore,
        baseConfidence: k.confidenceScore,
        source: 'signal',
        sources: k.sources,
        relatedSegments: k.relatedSegments ?? [],
        relatedUseCases: k.relatedUseCases ?? [],
      });
    }

    for (const g of input.competitorGaps?.gaps ?? []) {
      if (g.gapType !== 'missing' && g.gapType !== 'weak_coverage') continue;
      if (g.opportunityScore < 55) continue;
      add({
        keyword: g.keyword,
        normalizedKeyword: g.normalizedKeyword,
        baseStrength: g.opportunityScore,
        baseConfidence: g.confidenceScore,
        source: 'gap',
        sources: [],
        relatedSegments: [],
        relatedUseCases: g.relatedUseCases,
        competitorSupport: g.competitorCount,
      });
    }

    return Array.from(pool.values())
      .sort((a, b) => b.baseStrength - a.baseStrength)
      .slice(0, this.getMaxBases());
  }

  private shortLabelsFor(signals: KeywordSignalResult, source: KeywordSignalSource, maxWords: number): string[] {
    return signals.keywords
      .filter((k) => k.sources.length === 1 && k.sources[0] === source && k.normalizedKeyword.split(' ').length <= maxWords)
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .map((k) => k.keyword)
      .slice(0, 3);
  }

  // ---------------------------------------------------------------------
  // Pattern generation
  // ---------------------------------------------------------------------

  private generateForBase(
    base: BaseCandidate,
    audienceLabels: string[],
    useCaseLabels: string[],
    problemConcepts: string[],
  ): { keyword: string; expansionType: LongTailExpansionType; relatedUseCases: string[] }[] {
    const out: { keyword: string; expansionType: LongTailExpansionType; relatedUseCases: string[] }[] = [];
    const isGap = base.source === 'gap';
    const isFeatureBase = base.sources.includes('feature');

    for (const audience of audienceLabels) {
      if (this.normalizePhrase(audience) === base.normalizedKeyword) continue; // avoid self-referential "X for X"
      out.push({ keyword: `${base.keyword} for ${audience}`, expansionType: isGap ? 'competitor_gap' : isFeatureBase ? 'feature' : 'audience', relatedUseCases: [] });
    }
    for (const useCase of useCaseLabels) {
      if (this.normalizePhrase(useCase) === base.normalizedKeyword) continue; // avoid self-referential combos
      out.push({ keyword: `${base.keyword} for ${useCase}`, expansionType: isGap ? 'competitor_gap' : 'use_case', relatedUseCases: [useCase] });
      out.push({ keyword: `${useCase} ${base.keyword}`, expansionType: isGap ? 'competitor_gap' : 'use_case', relatedUseCases: [useCase] });
    }
    for (const concept of problemConcepts) {
      out.push({ keyword: `reduce ${concept}`, expansionType: isGap ? 'competitor_gap' : 'problem', relatedUseCases: [] });
      out.push({ keyword: `improve ${concept}`, expansionType: isGap ? 'competitor_gap' : 'problem', relatedUseCases: [] });
      out.push({ keyword: `${base.keyword} with ${concept} challenges`, expansionType: isGap ? 'competitor_gap' : 'problem', relatedUseCases: [] });
    }
    out.push({ keyword: `best ${base.keyword}`, expansionType: isGap ? 'competitor_gap' : 'comparison', relatedUseCases: [] });
    out.push({ keyword: `${base.keyword} pricing`, expansionType: isGap ? 'competitor_gap' : 'intent', relatedUseCases: [] });
    out.push({ keyword: `${base.keyword} alternatives`, expansionType: isGap ? 'competitor_gap' : 'comparison', relatedUseCases: [] });

    return out;
  }

  private scoreCandidate(
    generated: { keyword: string; expansionType: LongTailExpansionType; relatedUseCases: string[] },
    base: BaseCandidate,
  ): RawCandidate | null {
    const normalized = this.normalizePhrase(generated.keyword);
    if (!this.isQualityPhrase(normalized)) return null;
    if (this.hasAdjacentDuplicateWords(generated.keyword)) return null;

    const specificity = this.specificityScore(normalized);
    const patternWeight = PATTERN_TYPE_WEIGHT[generated.expansionType];

    let opportunityScore = this.clamp(Math.round(base.baseStrength * 0.55 + specificity * 0.2 + patternWeight * 0.25), 0, 100);
    opportunityScore = Math.min(opportunityScore, base.baseStrength + 8);

    let confidenceBonus = 10;
    if (generated.expansionType === 'problem') confidenceBonus = 5;
    const hasEvidence = generated.relatedUseCases.length > 0 || base.relatedUseCases.length > 0;
    let confidenceScore = this.clamp(
      Math.round(base.baseConfidence * 0.5 + (hasEvidence ? 15 : 0) + Math.min(15, base.sources.length * 4) + confidenceBonus),
      0,
      100,
    );

    const warnings: string[] = [];
    if (base.source === 'gap') {
      const support = base.competitorSupport ?? 0;
      const penalty = support >= 3 ? 0 : support === 2 ? 10 : 20;
      confidenceScore = this.clamp(confidenceScore - penalty, 0, 100);
      if (support < 2) warnings.push('Derived from a competitor-gap concept with limited competitor support.');
    }

    return {
      keyword: generated.keyword,
      normalizedKeyword: normalized,
      baseKeyword: base.keyword,
      expansionType: generated.expansionType,
      opportunityScore,
      confidenceScore,
      relatedSegments: base.relatedSegments,
      relatedUseCases: this.dedupe([...base.relatedUseCases, ...generated.relatedUseCases]),
      reasons: [`Expanded from strong base keyword "${base.keyword}" (${base.source} evidence).`],
      warnings: this.dedupe(warnings),
      sources: base.sources,
    };
  }

  private classifyCandidates(candidates: RawCandidate[]): Map<string, { primaryIntent: string; funnelStage: string }> {
    if (candidates.length === 0) return new Map();
    const syntheticSignals: KeywordSignal[] = candidates.map((c) => ({
      keyword: c.keyword,
      normalizedKeyword: c.normalizedKeyword,
      sources: c.sources,
      intent: [],
      confidenceScore: c.confidenceScore,
      evidence: [],
      relatedSegments: c.relatedSegments,
      relatedUseCases: c.relatedUseCases,
      warnings: [],
    }));
    const syntheticResult: KeywordSignalResult = {
      keywords: syntheticSignals,
      productKeywords: [],
      featureKeywords: [],
      audienceKeywords: [],
      problemKeywords: [],
      commercialKeywords: [],
      longTailKeywords: [],
      confidenceScore: 0,
      missingSignals: [],
      warnings: [],
      generatedAt: new Date(),
    };
    const classified = this.keywordIntentService.classify(syntheticResult);
    return new Map(classified.profiles.map((p) => [p.normalizedKeyword, { primaryIntent: p.primaryIntent, funnelStage: p.funnelStage }]));
  }

  // ---------------------------------------------------------------------
  // Text utilities
  // ---------------------------------------------------------------------

  private hasAdjacentDuplicateWords(phrase: string): boolean {
    const words = phrase.split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length - 1; i++) {
      if (words[i].toLowerCase() === words[i + 1].toLowerCase()) return true;
    }
    return false;
  }

  private specificityScore(normalized: string): number {
    const wordCount = normalized.split(' ').filter(Boolean).length;
    if (wordCount <= 1) return 10;
    if (wordCount === 2) return 30;
    if (wordCount === 3) return 55;
    if (wordCount >= 4 && wordCount <= 7) return 90;
    return 50;
  }

  private normalizePhrase(raw: string): string {
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
    if (/[.!?]/.test(normalized)) return false;
    const words = normalized.split(' ').filter(Boolean);
    if (words.length === 0 || words.length > 8) return false;
    if (words.length === 1 && GENERIC_TOKENS.has(normalized)) return false;
    return true;
  }

  private dedupe(items: string[]): string[] {
    return Array.from(new Set(items.filter((i) => i && i.trim())));
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private getMaxBases(): number {
    return this.getEnvNumber('KEYWORD_LONG_TAIL_MAX_BASES', DEFAULT_MAX_BASES);
  }

  private getMaxPerBase(): number {
    return this.getEnvNumber('KEYWORD_LONG_TAIL_MAX_PER_BASE', DEFAULT_MAX_PER_BASE);
  }

  private getMaxResults(): number {
    return this.getEnvNumber('KEYWORD_LONG_TAIL_MAX_RESULTS', DEFAULT_MAX_RESULTS);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
