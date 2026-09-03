import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AudienceSegment, AudienceSegmentResult } from '../audience-intelligence/types/audience-segment.types';
import type { AudiencePrioritizationResult, AudiencePriorityTier } from '../audience-intelligence/types/audience-prioritization.types';
import type { IcpResult } from '../audience-intelligence/types/icp.types';
import type { KeywordAudienceMatch, KeywordAudienceMapResult } from './types/keyword-audience-map.types';
import type { KeywordClusterResult } from './types/keyword-cluster.types';
import type { KeywordIntentResult } from './types/keyword-intent.types';
import type { KeywordLongTailResult } from './types/keyword-long-tail.types';
import type { KeywordOpportunityResult } from './types/keyword-opportunity.types';
import type { KeywordSignalResult } from './types/keyword-signal.types';

const DEFAULT_MIN_RELEVANCE = 45;
const DEFAULT_MAX_MATCHES_PER_KEYWORD = 3;

const GENERIC_TOKENS = new Set(['software', 'platform', 'tool', 'solution', 'service']);
const STOPWORDS = new Set(['for', 'the', 'a', 'an', 'to', 'of', 'with', 'and', 'best']);

const TIER_SCORE: Record<AudiencePriorityTier, number> = {
  primary: 1,
  secondary: 0.6,
  experimental: 0.3,
  insufficient_evidence: 0,
};

const DISCLAIMER =
  'Keyword-to-audience mappings are evidence-based relevance hypotheses and should be validated with real search and customer behavior.';

export interface KeywordAudienceMapAudienceInput {
  segments: AudienceSegmentResult;
  icp: IcpResult;
  prioritization: AudiencePrioritizationResult;
}

export interface KeywordAudienceMapInput {
  signals: KeywordSignalResult;
  intents: KeywordIntentResult;
  opportunities: KeywordOpportunityResult;
  longTail?: KeywordLongTailResult;
  audience: KeywordAudienceMapAudienceInput;
  clusters?: KeywordClusterResult;
}

interface Candidate {
  keyword: string;
  normalizedKeyword: string;
  relatedSegments: string[];
  relatedUseCases: string[];
  confidenceScore: number;
  opportunityScore: number;
  primaryIntent: string;
  funnelStage: string;
  sourcesCount: number;
}

@Injectable()
export class KeywordAudienceMapService {
  constructor(private readonly configService: ConfigService) {}

  map(input: KeywordAudienceMapInput): KeywordAudienceMapResult {
    const candidates = this.collectCandidates(input);
    const segments = input.audience.segments.segments;

    const minRelevance = this.getMinRelevance();
    const maxPerKeyword = this.getMaxMatchesPerKeyword();

    const allMatches: KeywordAudienceMatch[] = [];
    const unmapped: string[] = [];

    for (const candidate of candidates) {
      const scored = segments
        .map((segment) => this.scoreForSegment(candidate, segment, input.audience))
        .filter((m) => m.relevanceScore >= minRelevance)
        .sort((a, b) => {
          if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
          if (b.confidenceScore !== a.confidenceScore) return b.confidenceScore - a.confidenceScore;
          return a.segmentId.localeCompare(b.segmentId);
        })
        .slice(0, maxPerKeyword);

      if (scored.length === 0) {
        unmapped.push(candidate.keyword);
        continue;
      }
      allMatches.push(...scored);
    }

    const primaryAudienceByKeyword: Record<string, string> = {};
    const keywordsBySegment: Record<string, string[]> = {};
    const bestByKeyword = new Map<string, KeywordAudienceMatch>();

    for (const match of allMatches) {
      const bucket = keywordsBySegment[match.segmentId] ?? [];
      if (!bucket.includes(match.keyword)) bucket.push(match.keyword);
      keywordsBySegment[match.segmentId] = bucket;

      const currentBest = bestByKeyword.get(match.keyword);
      if (!currentBest || match.relevanceScore > currentBest.relevanceScore || (match.relevanceScore === currentBest.relevanceScore && match.confidenceScore > currentBest.confidenceScore)) {
        bestByKeyword.set(match.keyword, match);
      }
    }
    for (const [keyword, best] of bestByKeyword) primaryAudienceByKeyword[keyword] = best.segmentName;

    const confidenceScore = allMatches.length
      ? Math.round(allMatches.reduce((sum, m) => sum + m.confidenceScore, 0) / allMatches.length)
      : 0;

    return {
      matches: allMatches,
      primaryAudienceByKeyword,
      keywordsBySegment,
      unmappedKeywords: this.dedupe(unmapped),
      confidenceScore,
      warnings: [DISCLAIMER],
      generatedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------
  // Candidate collection
  // ---------------------------------------------------------------------

  private collectCandidates(input: KeywordAudienceMapInput): Candidate[] {
    const profileByKey = new Map(input.intents.profiles.map((p) => [p.normalizedKeyword, p]));
    const opportunityByKeyword = new Map(input.opportunities.opportunities.map((o) => [o.keyword, o]));

    const fromSignals: Candidate[] = input.signals.keywords.map((k) => {
      const profile = profileByKey.get(k.normalizedKeyword);
      const opp = opportunityByKeyword.get(k.keyword);
      return {
        keyword: k.keyword,
        normalizedKeyword: k.normalizedKeyword,
        relatedSegments: k.relatedSegments ?? [],
        relatedUseCases: k.relatedUseCases ?? [],
        confidenceScore: k.confidenceScore,
        opportunityScore: opp?.opportunityScore ?? k.confidenceScore,
        primaryIntent: profile?.primaryIntent ?? 'informational',
        funnelStage: profile?.funnelStage ?? 'awareness',
        sourcesCount: k.sources.length,
      };
    });

    const fromLongTail: Candidate[] = (input.longTail?.keywords ?? []).map((k) => ({
      keyword: k.keyword,
      normalizedKeyword: k.normalizedKeyword,
      relatedSegments: k.relatedSegments,
      relatedUseCases: k.relatedUseCases,
      confidenceScore: k.confidenceScore,
      opportunityScore: k.opportunityScore,
      primaryIntent: k.primaryIntent,
      funnelStage: k.funnelStage,
      sourcesCount: 1,
    }));

    return [...fromSignals, ...fromLongTail];
  }

  // ---------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------

  private scoreForSegment(candidate: Candidate, segment: AudienceSegment, audience: KeywordAudienceMapAudienceInput): KeywordAudienceMatch {
    const explicitHit = candidate.relatedSegments.includes(segment.id);
    const useCaseOverlap = this.intersectCaseInsensitive(candidate.relatedUseCases, segment.useCases);
    const useCaseHit = useCaseOverlap.length > 0;
    const segmentTerms = [...segment.roles, ...segment.userTypes].map((t) => t.toLowerCase());
    const wholeWordHit = segmentTerms.some((term) => this.containsWholeWord(candidate.normalizedKeyword, term));

    const strongSignalCount = [explicitHit, useCaseHit, wholeWordHit].filter(Boolean).length;
    const reasons: string[] = [];
    let relevance: number;

    if (strongSignalCount > 0) {
      relevance = 55 + Math.min(2, strongSignalCount - 1) * 15; // 55 / 70 / 85
      if (explicitHit) reasons.push(`Keyword is explicitly linked to the "${segment.name}" segment.`);
      if (useCaseHit) reasons.push(`Shares related use case(s): ${useCaseOverlap.join(', ')}.`);
      if (wholeWordHit) reasons.push(`Keyword wording directly references the "${segment.name}" audience.`);
    } else {
      const overlap = this.weightedTokenOverlap(candidate.normalizedKeyword, this.segmentVocabulary(segment));
      relevance = Math.round(overlap * 30);
      if (relevance > 0) reasons.push(`Weak term overlap with the "${segment.name}" segment.`);
    }

    const priority = audience.prioritization.priorities.find((p) => p.segmentId === segment.id);
    const tierScore = priority ? TIER_SCORE[priority.tier] : 0;
    const icpCandidate = audience.icp.candidates.find((c) => c.segmentId === segment.id);
    const icpScore = icpCandidate ? icpCandidate.fitScore / 100 : 0;
    const priorityIcpBonus = Math.round((tierScore * 0.6 + icpScore * 0.4) * 10);
    if (priority && (priority.tier === 'primary' || priority.tier === 'secondary')) {
      reasons.push(`Segment is a ${priority.tier} audience priority.`);
    }

    const opportunityBonus = Math.round((candidate.opportunityScore / 100) * 10);

    relevance = this.clamp(relevance + priorityIcpBonus + opportunityBonus, 0, 100);

    const explicitBonus = explicitHit ? 15 : 0;
    const useCaseBonus = useCaseHit ? 10 : 0;
    const confidenceScore = this.clamp(
      Math.round(candidate.confidenceScore * 0.4 + segment.confidenceScore * 0.35 + explicitBonus + useCaseBonus + Math.min(10, candidate.sourcesCount * 3)),
      0,
      100,
    );

    const warnings: string[] = [];
    if (strongSignalCount === 0) warnings.push('Match is based on weak term overlap only; treat with caution.');

    return {
      keyword: candidate.keyword,
      normalizedKeyword: candidate.normalizedKeyword,
      segmentId: segment.id,
      segmentName: segment.name,
      relevanceScore: relevance,
      confidenceScore,
      primaryIntent: candidate.primaryIntent,
      funnelStage: candidate.funnelStage,
      relatedUseCases: this.dedupe([...useCaseOverlap]),
      reasons,
      warnings: this.dedupe(warnings),
    };
  }

  private segmentVocabulary(segment: AudienceSegment): string {
    return this.normalizeText([segment.name, ...segment.roles, ...segment.userTypes, ...segment.industries].join(' '));
  }

  private intersectCaseInsensitive(a: string[], b: string[]): string[] {
    const setB = new Set(b.map((x) => x.toLowerCase()));
    const seen = new Set<string>();
    const result: string[] = [];
    for (const x of a) {
      const key = x.toLowerCase();
      if (setB.has(key) && !seen.has(key)) {
        seen.add(key);
        result.push(x);
      }
    }
    return result;
  }

  private containsWholeWord(haystackNormalized: string, term: string): boolean {
    if (!term.trim()) return false;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(haystackNormalized);
  }

  private weightedTokenOverlap(normalizedPhrase: string, vocabularyNormalized: string): number {
    const phraseTokens = this.weightedTokens(normalizedPhrase);
    const vocabTokens = this.weightedTokens(vocabularyNormalized);
    const allTokens = new Set([...phraseTokens.keys(), ...vocabTokens.keys()]);
    let unionWeight = 0;
    let interWeight = 0;
    for (const t of allTokens) {
      const wa = phraseTokens.get(t) ?? 0;
      const wb = vocabTokens.get(t) ?? 0;
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
      map.set(t, GENERIC_TOKENS.has(t) ? 0.25 : 1);
    }
    return map;
  }

  private normalizeText(raw: string): string {
    return raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private dedupe(items: string[]): string[] {
    return Array.from(new Set(items.filter((i) => i && i.trim())));
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private getMinRelevance(): number {
    return this.getEnvNumber('KEYWORD_AUDIENCE_MIN_RELEVANCE', DEFAULT_MIN_RELEVANCE);
  }

  private getMaxMatchesPerKeyword(): number {
    return this.getEnvNumber('KEYWORD_AUDIENCE_MAX_MATCHES_PER_KEYWORD', DEFAULT_MAX_MATCHES_PER_KEYWORD);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
