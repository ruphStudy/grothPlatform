import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { KeywordCluster, KeywordClusterResult } from './types/keyword-cluster.types';
import type { KeywordIntentResult, SearchIntentPrimary } from './types/keyword-intent.types';
import type { KeywordOpportunity, KeywordOpportunityResult, KeywordOpportunityTier } from './types/keyword-opportunity.types';
import type { KeywordSignal, KeywordSignalResult } from './types/keyword-signal.types';

const DEFAULT_HIGH_MIN_SCORE = 75;
const DEFAULT_MEDIUM_MIN_SCORE = 55;
const DEFAULT_LOW_MIN_SCORE = 35;
const DEFAULT_MAX_KEYWORDS = 100;

// Relative usefulness of the primary intent for a marketing keyword strategy
// — NOT a claim about actual conversion rate, CPC, or business value.
const INTENT_VALUE: Record<SearchIntentPrimary, number> = {
  transactional: 100,
  comparison: 90,
  commercial: 85,
  solution: 80,
  audience_specific: 75,
  problem: 65,
  informational: 55,
  navigational: 50,
};

export interface KeywordOpportunityInput {
  signals: KeywordSignalResult;
  intents: KeywordIntentResult;
  clusters: KeywordClusterResult;
}

@Injectable()
export class KeywordOpportunityService {
  constructor(private readonly configService: ConfigService) {}

  score(input: KeywordOpportunityInput): KeywordOpportunityResult {
    const profileByKey = new Map(input.intents.profiles.map((p) => [p.normalizedKeyword, p]));
    const clusterByKeyword = new Map<string, KeywordCluster>();
    for (const cluster of input.clusters.clusters) {
      for (const kw of cluster.keywords) clusterByKeyword.set(kw, cluster);
    }

    const opportunities: KeywordOpportunity[] = [];
    for (const signal of input.signals.keywords) {
      const profile = profileByKey.get(signal.normalizedKeyword);
      if (!profile) continue; // no intent classification available — skip rather than fabricate one
      const cluster = clusterByKeyword.get(signal.keyword);
      opportunities.push(this.scoreOne(signal, profile.primaryIntent, profile.confidenceScore, profile.funnelStage, cluster));
    }

    opportunities.sort((a, b) => {
      if (b.opportunityScore !== a.opportunityScore) return b.opportunityScore - a.opportunityScore;
      if (b.confidenceScore !== a.confidenceScore) return b.confidenceScore - a.confidenceScore;
      return a.keyword.localeCompare(b.keyword);
    });
    const bounded = opportunities.slice(0, this.getMaxKeywords());

    const highOpportunityKeywords = this.dedupe(bounded.filter((o) => o.tier === 'high').map((o) => o.keyword));
    const mediumOpportunityKeywords = this.dedupe(bounded.filter((o) => o.tier === 'medium').map((o) => o.keyword));
    const confidenceScore = bounded.length
      ? Math.round(bounded.reduce((sum, o) => sum + o.confidenceScore, 0) / bounded.length)
      : 0;

    return {
      opportunities: bounded,
      highOpportunityKeywords,
      mediumOpportunityKeywords,
      confidenceScore,
      warnings: [
        'Opportunity scores are evidence-based heuristics and do not include search volume, CPC, SEO difficulty, or ranking potential.',
      ],
      generatedAt: new Date(),
    };
  }

  private scoreOne(
    signal: KeywordSignal,
    primaryIntent: SearchIntentPrimary,
    intentConfidence: number,
    funnelStage: string,
    cluster?: KeywordCluster,
  ): KeywordOpportunity {
    const keywordConfidence = signal.confidenceScore;
    const intentValue = INTENT_VALUE[primaryIntent] ?? 50;
    const clusterSupport = cluster ? this.clamp(Math.round(cluster.coherenceScore * 0.6 + cluster.confidenceScore * 0.4), 0, 100) : 40;
    const audienceUseCaseSpecificity = this.audienceUseCaseSpecificity(signal);
    const longTailSpecificity = this.longTailSpecificity(signal.normalizedKeyword);
    const distinctSources = signal.sources.length;

    const opportunityScore = this.clamp(
      Math.round(
        keywordConfidence * 0.25 +
          intentConfidence * 0.2 +
          intentValue * 0.2 +
          clusterSupport * 0.15 +
          audienceUseCaseSpecificity * 0.1 +
          longTailSpecificity * 0.1,
      ),
      0,
      100,
    );

    const confidenceScore = this.clamp(
      Math.round(
        keywordConfidence * 0.4 +
          intentConfidence * 0.35 +
          Math.min(15, distinctSources * 5) +
          (cluster ? Math.min(10, Math.round(cluster.confidenceScore / 10)) : 0),
      ),
      0,
      100,
    );

    const tier = this.computeTier(opportunityScore);

    const strengths: string[] = [];
    if (intentValue >= 80) strengths.push('Clear commercial/solution intent.');
    if (cluster && cluster.coherenceScore >= 60) strengths.push('Backed by a coherent keyword cluster.');
    if (distinctSources >= 3) strengths.push('Multiple independent evidence sources.');
    if (audienceUseCaseSpecificity >= 60) strengths.push('Audience or use-case-specific targeting evidence.');
    if (longTailSpecificity >= 80) strengths.push('Effective long-tail specificity.');

    const weaknesses: string[] = ['Search-demand data is unavailable.'];
    if (keywordConfidence < 50) weaknesses.push('Keyword is weakly supported by product evidence.');
    if (!cluster) weaknesses.push('Keyword is unclustered.');
    if (intentConfidence < 50) weaknesses.push('Intent classification confidence is limited.');

    const reasons: string[] = [];
    if (intentValue >= 85 && signal.sources.some((s) => s === 'market_category' || s === 'market_term' || s === 'feature')) {
      reasons.push('Strong commercial intent with clear product-category evidence.');
    }
    if (primaryIntent === 'audience_specific' && longTailSpecificity >= 55 && intentConfidence >= 55) {
      reasons.push('High-confidence audience-specific long-tail keyword.');
    }
    if (clusterSupport >= 60 && distinctSources < 2) {
      reasons.push('Strong use-case/cluster support but limited source diversity.');
    }
    if (reasons.length === 0) {
      reasons.push(tier === 'insufficient_evidence' ? 'Limited evidence supports this keyword.' : 'Moderate evidence supports this keyword.');
    }

    const warnings: string[] = [];
    if (confidenceScore < 40) warnings.push('Low classification confidence; treat this score cautiously.');

    return {
      keyword: signal.keyword,
      normalizedKeyword: signal.normalizedKeyword,
      clusterId: cluster?.id,
      opportunityScore,
      confidenceScore,
      tier,
      primaryIntent,
      funnelStage,
      reasons,
      strengths,
      weaknesses: this.dedupe(weaknesses),
      warnings: this.dedupe(warnings),
    };
  }

  private audienceUseCaseSpecificity(signal: KeywordSignal): number {
    let score = 0;
    if ((signal.relatedUseCases?.length ?? 0) > 0) score += 40;
    if ((signal.relatedSegments?.length ?? 0) > 0) score += 30;
    if (signal.sources.includes('audience') || signal.sources.includes('use_case')) score += 30;
    return this.clamp(score, 0, 100);
  }

  private longTailSpecificity(normalizedKeyword: string): number {
    const wordCount = normalizedKeyword.split(' ').filter(Boolean).length;
    if (wordCount <= 1) return 10;
    if (wordCount === 2) return 30;
    if (wordCount === 3) return 55;
    if (wordCount >= 4 && wordCount <= 6) return 90;
    if (wordCount === 7) return 70;
    return 50; // very long phrases are not blindly rewarded
  }

  private computeTier(opportunityScore: number): KeywordOpportunityTier {
    if (opportunityScore >= this.getHighMinScore()) return 'high';
    if (opportunityScore >= this.getMediumMinScore()) return 'medium';
    if (opportunityScore >= this.getLowMinScore()) return 'low';
    return 'insufficient_evidence';
  }

  private dedupe(items: string[]): string[] {
    return Array.from(new Set(items.filter((i) => i && i.trim())));
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private getHighMinScore(): number {
    return this.getEnvNumber('KEYWORD_OPPORTUNITY_HIGH_MIN_SCORE', DEFAULT_HIGH_MIN_SCORE);
  }

  private getMediumMinScore(): number {
    return this.getEnvNumber('KEYWORD_OPPORTUNITY_MEDIUM_MIN_SCORE', DEFAULT_MEDIUM_MIN_SCORE);
  }

  private getLowMinScore(): number {
    return this.getEnvNumber('KEYWORD_OPPORTUNITY_LOW_MIN_SCORE', DEFAULT_LOW_MIN_SCORE);
  }

  private getMaxKeywords(): number {
    return this.getEnvNumber('KEYWORD_OPPORTUNITY_MAX_KEYWORDS', DEFAULT_MAX_KEYWORDS);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
