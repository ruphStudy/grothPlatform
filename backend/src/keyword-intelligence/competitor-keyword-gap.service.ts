import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CompetitorWebsiteAnalysis, CompetitorWebsiteAnalysisBatchResult } from '../market-intelligence/types/competitor-analysis.types';
import type { CompetitorFeatureComparisonResult } from '../market-intelligence/types/competitor-feature-comparison.types';
import type { KeywordClusterResult } from './types/keyword-cluster.types';
import type { CompetitorKeywordGap, CompetitorKeywordGapResult, CompetitorKeywordGapType } from './types/competitor-keyword-gap.types';
import type { KeywordIntentResult } from './types/keyword-intent.types';
import type { KeywordOpportunityResult } from './types/keyword-opportunity.types';
import type { KeywordSignal, KeywordSignalResult } from './types/keyword-signal.types';

const DEFAULT_MIN_COMPETITOR_SUPPORT = 2;
const DEFAULT_MAX_RESULTS = 50;
const DEFAULT_MAX_STRONGEST = 10;

// Same conservative bar as 11C keyword clustering — shared meaningful tokens
// only; a single generic word (e.g. "software") never counts as a match.
const MATCH_SIMILARITY_THRESHOLD = 0.45;

const STOPWORDS = new Set(['for', 'the', 'a', 'an', 'to', 'of', 'with', 'and', 'best']);
const GENERIC_TOKENS = new Set(['software', 'platform', 'tool', 'solution', 'service']);
const GENERIC_TOKEN_WEIGHT = 0.25;

const DISCLAIMER =
  'Competitor keyword gaps are inferred from public competitor messaging, not verified search rankings or traffic data.';

export interface CompetitorKeywordGapInput {
  ownSignals: KeywordSignalResult;
  ownIntents: KeywordIntentResult;
  ownClusters: KeywordClusterResult;
  ownOpportunities: KeywordOpportunityResult;
  competitorAnalysis: CompetitorWebsiteAnalysisBatchResult;
  featureComparison?: CompetitorFeatureComparisonResult;
}

interface Concept {
  keyword: string;
  normalized: string;
  tokens: Map<string, number>;
  competitors: Set<string>;
  importanceScore?: number;
  sourceKind: 'feature_gap' | 'common_capability' | 'differentiator' | 'raw_evidence';
}

interface OwnEntry {
  signal: KeywordSignal;
  tokens: Map<string, number>;
}

@Injectable()
export class CompetitorKeywordGapService {
  constructor(private readonly configService: ConfigService) {}

  analyze(input: CompetitorKeywordGapInput): CompetitorKeywordGapResult {
    const hasFeatureComparison = !!input.featureComparison;
    if (input.competitorAnalysis.competitors.length === 0 && !hasFeatureComparison) {
      return {
        gaps: [],
        strongestGapKeywords: [],
        sharedKeywords: [],
        differentiationKeywords: [],
        confidenceScore: 0,
        warnings: this.dedupe([DISCLAIMER, 'No competitor evidence is available; gap analysis could not be performed.']),
        generatedAt: new Date(),
      };
    }

    const ownEntries: OwnEntry[] = input.ownSignals.keywords.map((signal) => ({ signal, tokens: this.weightedTokens(signal.normalizedKeyword) }));
    const opportunityByKeyword = new Map(input.ownOpportunities.opportunities.map((o) => [o.keyword, o]));
    const clusterCoherenceByKeyword = new Map<string, number>();
    for (const cluster of input.ownClusters.clusters) {
      for (const kw of cluster.keywords) clusterCoherenceByKeyword.set(kw, cluster.coherenceScore);
    }

    const concepts = this.collectConcepts(input);

    const gaps: CompetitorKeywordGap[] = [];
    for (const concept of concepts.values()) {
      const gap = this.buildGap(concept, ownEntries, opportunityByKeyword, clusterCoherenceByKeyword, input.competitorAnalysis.competitors.length);
      if (gap) gaps.push(gap);
    }

    // Fallback differentiation scan: a strongly-supported own keyword with no
    // comparable concept anywhere in the competitor evidence — only when
    // Sprint 9's own productDifferentiators list wasn't already available.
    if (!hasFeatureComparison || (input.featureComparison?.productDifferentiators.length ?? 0) === 0) {
      const alreadyCovered = new Set(gaps.map((g) => g.normalizedKeyword));
      for (const entry of ownEntries) {
        if (alreadyCovered.has(entry.signal.normalizedKeyword)) continue;
        const opp = opportunityByKeyword.get(entry.signal.keyword);
        const strong = entry.signal.confidenceScore >= 65 && (opp ? opp.tier === 'high' || opp.tier === 'medium' : entry.signal.confidenceScore >= 65);
        if (!strong) continue;
        const bestMatch = this.bestConceptMatch(entry.tokens, concepts);
        if (bestMatch && bestMatch.sim >= MATCH_SIMILARITY_THRESHOLD) continue; // already has a comparable competitor concept

        gaps.push(
          this.buildDifferentiationGap(entry, opp, clusterCoherenceByKeyword, 'No comparable competitor evidence found; may indicate a differentiated positioning.'),
        );
        alreadyCovered.add(entry.signal.normalizedKeyword);
      }
    }

    gaps.sort((a, b) => b.opportunityScore - a.opportunityScore || a.keyword.localeCompare(b.keyword));
    const bounded = gaps.slice(0, this.getMaxResults());

    const strongestGapKeywords = bounded
      .filter((g) => g.gapType === 'missing' || g.gapType === 'weak_coverage')
      .slice(0, this.getMaxStrongest())
      .map((g) => g.keyword);
    const sharedKeywords = this.dedupe(bounded.filter((g) => g.gapType === 'shared').map((g) => g.keyword));
    const differentiationKeywords = this.dedupe(bounded.filter((g) => g.gapType === 'differentiation').map((g) => g.keyword));

    const confidenceScore = bounded.length
      ? Math.round(bounded.reduce((sum, g) => sum + g.confidenceScore, 0) / bounded.length)
      : 0;

    const warnings = [DISCLAIMER];
    if (input.competitorAnalysis.competitors.length === 0) {
      warnings.push('No analyzed competitor websites were available; gap analysis relies on structured feature-comparison evidence only.');
    } else if (input.competitorAnalysis.competitors.length === 1) {
      warnings.push('Only one competitor was analyzed; competitive gap confidence is limited.');
    } else if (input.competitorAnalysis.competitors.length < this.getMinCompetitorSupport()) {
      warnings.push('Fewer than the minimum recommended number of competitors were analyzed; treat gap confidence cautiously.');
    }

    return {
      gaps: bounded,
      strongestGapKeywords,
      sharedKeywords,
      differentiationKeywords,
      confidenceScore,
      warnings: this.dedupe(warnings),
      generatedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------
  // Concept collection (competitor side)
  // ---------------------------------------------------------------------

  private collectConcepts(input: CompetitorKeywordGapInput): Map<string, Concept> {
    const concepts = new Map<string, Concept>();
    const addConcept = (
      raw: string,
      opts: { competitors: string[]; importanceScore?: number; sourceKind: Concept['sourceKind'] },
      excludeBrand?: string,
    ) => {
      const normalized = this.normalizePhrase(raw);
      if (!this.isQualityPhrase(normalized)) return;
      if (excludeBrand && normalized === this.normalizePhrase(excludeBrand)) return;

      const existing = concepts.get(normalized);
      if (!existing) {
        concepts.set(normalized, {
          keyword: raw.trim(),
          normalized,
          tokens: this.weightedTokens(normalized),
          competitors: new Set(opts.competitors),
          importanceScore: opts.importanceScore,
          sourceKind: opts.sourceKind,
        });
        return;
      }
      for (const c of opts.competitors) existing.competitors.add(c);
      if (opts.importanceScore !== undefined) existing.importanceScore = Math.max(existing.importanceScore ?? 0, opts.importanceScore);
      // A capability-sourced classification is more informative than a raw-text guess; prefer it.
      if (opts.sourceKind !== 'raw_evidence') existing.sourceKind = opts.sourceKind;
    };

    const fc = input.featureComparison;
    for (const gap of fc?.possibleFeatureGaps ?? []) {
      addConcept(gap.capability, { competitors: gap.competitors, importanceScore: gap.importanceScore, sourceKind: 'feature_gap' });
    }
    for (const cap of fc?.commonCapabilities ?? []) {
      addConcept(cap, { competitors: input.competitorAnalysis.competitors.map((c) => c.name), sourceKind: 'common_capability' });
    }
    for (const diff of fc?.productDifferentiators ?? []) {
      addConcept(diff, { competitors: [], sourceKind: 'differentiator' });
    }

    for (const competitor of input.competitorAnalysis.competitors) {
      const phrases = [
        ...competitor.features.slice(0, 20),
        ...competitor.keyStatements.slice(0, 8),
        ...competitor.documentation.topics.slice(0, 8),
        ...(competitor.title ? [competitor.title] : []),
        ...(competitor.metaDescription ? [competitor.metaDescription] : []),
      ];
      const seen = new Set<string>();
      for (const raw of phrases) {
        const normalized = this.normalizePhrase(raw);
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        addConcept(raw, { competitors: [competitor.name], sourceKind: 'raw_evidence' }, competitor.name);
      }
    }

    return concepts;
  }

  // ---------------------------------------------------------------------
  // Gap building
  // ---------------------------------------------------------------------

  private buildGap(
    concept: Concept,
    ownEntries: OwnEntry[],
    opportunityByKeyword: Map<string, KeywordOpportunityResult['opportunities'][number]>,
    clusterCoherenceByKeyword: Map<string, number>,
    totalCompetitorsAnalyzed: number,
  ): CompetitorKeywordGap | null {
    const match = this.bestOwnMatch(concept.tokens, ownEntries);
    const matched = !!match && match.sim >= MATCH_SIMILARITY_THRESHOLD;
    const competitors = Array.from(concept.competitors);
    const competitorCount = competitors.length;

    if (concept.sourceKind === 'differentiator') {
      const opp = matched ? opportunityByKeyword.get(match!.entry.signal.keyword) : undefined;
      return this.buildDifferentiationGap(
        matched ? match!.entry : { signal: { keyword: concept.keyword, normalizedKeyword: concept.normalized, sources: [], intent: [], confidenceScore: 50, evidence: [], warnings: [] }, tokens: concept.tokens },
        opp,
        clusterCoherenceByKeyword,
        'Listed as a product differentiator in Sprint 9 feature comparison.',
      );
    }

    const ownOpp = matched ? opportunityByKeyword.get(match!.entry.signal.keyword) : undefined;
    const ownConfidence = matched ? match!.entry.signal.confidenceScore : 0;
    const ownStrong = matched && ownConfidence >= 60 && (ownOpp ? ownOpp.tier === 'high' || ownOpp.tier === 'medium' : ownConfidence >= 60);

    const prevalence = this.competitorPrevalenceScore(competitorCount);
    const specificity = this.specificityScore(concept.normalized);
    const relevance = this.relevanceScore(concept.tokens, ownEntries);

    let gapType: CompetitorKeywordGapType;
    let opportunityScore: number;
    let confidenceScore: number;
    const reasons: string[] = [];
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const warnings: string[] = [];

    if (!matched) {
      gapType = 'missing';
      opportunityScore = this.clamp(Math.round(prevalence * 0.5 + specificity * 0.25 + relevance * 0.25), 0, 100);
      confidenceScore = this.clamp(Math.round(prevalence * 0.7 + Math.min(30, (concept.importanceScore ?? 50) * 0.3)), 0, 100);
      reasons.push(`Mentioned by ${competitorCount} competitor(s)${competitors.length ? ` (${competitors.join(', ')})` : ''} but not found in our own keyword evidence.`);
      weaknesses.push('We have no equivalent keyword/topic coverage for this concept.');
    } else if (ownStrong) {
      gapType = 'shared';
      opportunityScore = ownOpp?.opportunityScore ?? this.clamp(Math.round((ownConfidence + prevalence) / 2), 0, 100);
      confidenceScore = this.clamp(Math.round(((ownOpp?.confidenceScore ?? ownConfidence) + prevalence) / 2), 0, 100);
      reasons.push(`Clearly present in both our own evidence ("${match!.entry.signal.keyword}") and ${competitorCount} competitor(s).`);
      strengths.push('Validated by both our own product evidence and competitor messaging.');
    } else {
      gapType = 'weak_coverage';
      opportunityScore = this.clamp(Math.round(prevalence * 0.4 + (100 - ownConfidence) * 0.3 + specificity * 0.15 + relevance * 0.15), 0, 100);
      confidenceScore = this.clamp(Math.round(prevalence * 0.5 + ownConfidence * 0.3 + (ownOpp?.confidenceScore ?? ownConfidence) * 0.2), 0, 100);
      reasons.push(
        `We have related keyword evidence ("${match!.entry.signal.keyword}", confidence ${ownConfidence}) but ${competitorCount} competitor(s) show stronger or repeated coverage.`,
      );
      strengths.push(`Related own keyword exists: "${match!.entry.signal.keyword}".`);
      weaknesses.push('Our own evidence for this concept is weak relative to competitor coverage.');
    }

    if (competitorCount > 0 && competitorCount < this.getMinCompetitorSupport()) {
      warnings.push('Supported by fewer than the minimum recommended competitor count; treat with caution.');
    }
    if (matched) {
      const coherence = clusterCoherenceByKeyword.get(match!.entry.signal.keyword);
      if (coherence !== undefined && coherence >= 60) strengths.push('Backed by a coherent internal keyword cluster.');
    }

    return {
      keyword: concept.keyword,
      normalizedKeyword: concept.normalized,
      gapType,
      competitorCount,
      competitors,
      relatedFeatures: concept.sourceKind === 'raw_evidence' ? [] : [concept.keyword],
      relatedUseCases: matched ? match!.entry.signal.relatedUseCases ?? [] : [],
      opportunityScore,
      confidenceScore,
      reasons,
      strengths,
      weaknesses: this.dedupe(weaknesses),
      warnings: this.dedupe(warnings),
    };
  }

  private buildDifferentiationGap(
    entry: OwnEntry,
    opp: KeywordOpportunityResult['opportunities'][number] | undefined,
    clusterCoherenceByKeyword: Map<string, number>,
    primaryReason: string,
  ): CompetitorKeywordGap {
    const opportunityScore = opp?.opportunityScore ?? 65;
    const confidenceScore = opp?.confidenceScore ?? entry.signal.confidenceScore ?? 50;
    const strengths = ['Strongly supported by our own product evidence.'];
    const coherence = clusterCoherenceByKeyword.get(entry.signal.keyword);
    if (coherence !== undefined && coherence >= 60) strengths.push('Backed by a coherent internal keyword cluster.');

    return {
      keyword: entry.signal.keyword,
      normalizedKeyword: entry.signal.normalizedKeyword,
      gapType: 'differentiation',
      competitorCount: 0,
      competitors: [],
      relatedFeatures: [entry.signal.keyword],
      relatedUseCases: entry.signal.relatedUseCases ?? [],
      opportunityScore,
      confidenceScore,
      reasons: [primaryReason],
      strengths,
      weaknesses: this.dedupe(['Competitive validation for this concept is limited or absent.']),
      warnings: this.dedupe(['Absence of competitor evidence does not confirm market uniqueness or demand.']),
    };
  }

  // ---------------------------------------------------------------------
  // Similarity / scoring
  // ---------------------------------------------------------------------

  private bestOwnMatch(conceptTokens: Map<string, number>, ownEntries: OwnEntry[]): { entry: OwnEntry; sim: number } | undefined {
    let best: { entry: OwnEntry; sim: number } | undefined;
    for (const entry of ownEntries) {
      const sim = this.tokenOverlap(conceptTokens, entry.tokens);
      if (!best || sim > best.sim) best = { entry, sim };
    }
    return best;
  }

  private bestConceptMatch(ownTokens: Map<string, number>, concepts: Map<string, Concept>): { concept: Concept; sim: number } | undefined {
    let best: { concept: Concept; sim: number } | undefined;
    for (const concept of concepts.values()) {
      const sim = this.tokenOverlap(ownTokens, concept.tokens);
      if (!best || sim > best.sim) best = { concept, sim };
    }
    return best;
  }

  private relevanceScore(conceptTokens: Map<string, number>, ownEntries: OwnEntry[]): number {
    const best = this.bestOwnMatch(conceptTokens, ownEntries);
    return this.clamp(Math.round((best?.sim ?? 0) * 100), 0, 100);
  }

  private competitorPrevalenceScore(count: number): number {
    if (count <= 0) return 0;
    if (count === 1) return 40;
    if (count === 2) return 65;
    return 85;
  }

  private specificityScore(normalized: string): number {
    const wordCount = normalized.split(' ').filter(Boolean).length;
    if (wordCount <= 1) return 10;
    if (wordCount === 2) return 30;
    if (wordCount === 3) return 55;
    if (wordCount >= 4 && wordCount <= 6) return 90;
    if (wordCount === 7) return 70;
    return 50;
  }

  private tokenOverlap(a: Map<string, number>, b: Map<string, number>): number {
    const allTokens = new Set([...a.keys(), ...b.keys()]);
    let unionWeight = 0;
    let interWeight = 0;
    for (const t of allTokens) {
      const wa = a.get(t) ?? 0;
      const wb = b.get(t) ?? 0;
      unionWeight += Math.max(wa, wb);
      interWeight += Math.min(wa, wb);
    }
    return unionWeight > 0 ? interWeight / unionWeight : 0;
  }

  private weightedTokens(normalized: string): Map<string, number> {
    const tokens = normalized.split(/[\s-]+/).filter(Boolean);
    const map = new Map<string, number>();
    for (const t of tokens) {
      if (STOPWORDS.has(t)) continue;
      map.set(t, GENERIC_TOKENS.has(t) ? GENERIC_TOKEN_WEIGHT : 1);
    }
    return map;
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

  private getMinCompetitorSupport(): number {
    return this.getEnvNumber('KEYWORD_GAP_MIN_COMPETITOR_SUPPORT', DEFAULT_MIN_COMPETITOR_SUPPORT);
  }

  private getMaxResults(): number {
    return this.getEnvNumber('KEYWORD_GAP_MAX_RESULTS', DEFAULT_MAX_RESULTS);
  }

  private getMaxStrongest(): number {
    return this.getEnvNumber('KEYWORD_GAP_MAX_STRONGEST', DEFAULT_MAX_STRONGEST);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
