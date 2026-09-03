import { Injectable } from '@nestjs/common';
import type { KeywordSignal, KeywordSignalResult } from './types/keyword-signal.types';
import type { KeywordFunnelStage, KeywordIntentProfile, KeywordIntentResult, SearchIntentPrimary } from './types/keyword-intent.types';

// Deterministic tie-break order when multiple intents are equally supported.
const PRECEDENCE: SearchIntentPrimary[] = [
  'transactional', 'comparison', 'commercial', 'problem', 'solution', 'informational', 'audience_specific', 'navigational',
];

const FUNNEL_BY_INTENT: Record<SearchIntentPrimary, KeywordFunnelStage> = {
  informational: 'awareness',
  problem: 'awareness',
  solution: 'consideration',
  commercial: 'consideration',
  audience_specific: 'consideration',
  transactional: 'decision',
  comparison: 'decision',
  navigational: 'decision',
};

interface PatternRule {
  intent: SearchIntentPrimary;
  pattern: RegExp;
  weight: number;
  reason: string;
}

// Phrase-pattern evidence — independent of (but reinforced by) 11A's own
// source/intent tags. Weights reflect how strongly the pattern alone implies
// its intent (transactional/comparison/problem phrasing is unambiguous;
// informational/commercial/audience phrasing is softer on its own).
const PATTERN_RULES: PatternRule[] = [
  { intent: 'transactional', pattern: /\b(pricing|plans?|buy|free trial|trial|sign ?up)\b/, weight: 5, reason: 'Phrase contains transactional language (pricing/trial/sign-up).' },
  { intent: 'comparison', pattern: /\b(best|vs|versus|alternatives?|comparison)\b/, weight: 5, reason: 'Phrase contains comparison language (best/vs/alternatives).' },
  { intent: 'problem', pattern: /\b(reduce|improve|fix|manual|slow|inconsistent|lack|difficult(y|ies)?)\b/, weight: 5, reason: 'Phrase contains problem-oriented language.' },
  { intent: 'informational', pattern: /\b(how|guide|learn|tips|what is|practice)\b/, weight: 3, reason: 'Phrase contains informational language (how/guide/learn/tips).' },
  { intent: 'commercial', pattern: /\b(software|platform|tool|solution|service)\b/, weight: 3, reason: 'Phrase contains commercial category language.' },
  { intent: 'audience_specific', pattern: /\bfor [a-z]/, weight: 3, reason: 'Phrase targets a specific audience ("for ...").' },
];

@Injectable()
export class KeywordIntentService {
  classify(signals: KeywordSignalResult): KeywordIntentResult {
    const profiles = signals.keywords.map((k) => this.classifyOne(k));

    const byPrimaryIntent: Record<string, string[]> = {};
    for (const p of profiles) {
      const bucket = byPrimaryIntent[p.primaryIntent] ?? [];
      if (!bucket.includes(p.keyword)) bucket.push(p.keyword);
      byPrimaryIntent[p.primaryIntent] = bucket;
    }

    const awarenessKeywords = this.dedupe(profiles.filter((p) => p.funnelStage === 'awareness').map((p) => p.keyword));
    const considerationKeywords = this.dedupe(profiles.filter((p) => p.funnelStage === 'consideration').map((p) => p.keyword));
    const decisionKeywords = this.dedupe(profiles.filter((p) => p.funnelStage === 'decision').map((p) => p.keyword));

    const confidenceScore = profiles.length
      ? Math.round(profiles.reduce((sum, p) => sum + p.confidenceScore, 0) / profiles.length)
      : 0;

    const warnings = [
      'Search-intent classification is derived from phrase patterns and keyword-signal evidence; it does not reflect actual search-engine query or ranking data.',
    ];
    if (profiles.length > 0 && profiles.filter((p) => p.warnings.length > 0).length / profiles.length >= 0.5) {
      warnings.push('Several keywords lack strong governing intent signals and used a deterministic fallback.');
    }

    return {
      profiles,
      byPrimaryIntent,
      awarenessKeywords,
      considerationKeywords,
      decisionKeywords,
      confidenceScore,
      warnings: this.dedupe(warnings),
      generatedAt: new Date(),
    };
  }

  private classifyOne(keyword: KeywordSignal): KeywordIntentProfile {
    const votes = new Map<SearchIntentPrimary, { score: number; reasons: string[] }>();
    const addVote = (intent: SearchIntentPrimary, weight: number, reason: string) => {
      const existing = votes.get(intent) ?? { score: 0, reasons: [] };
      existing.score += weight;
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      votes.set(intent, existing);
    };

    // Brand/product-name-only keywords are navigational, and override
    // everything else — but only when the keyword has no other supporting
    // source (a genuinely brand-only query), never for generic phrases.
    const isBrandOnly = keyword.sources.length === 1 && keyword.sources[0] === 'product_name';
    if (isBrandOnly) {
      addVote('navigational', 6, 'Keyword is derived solely from the product/brand name.');
    }

    // Reuse 11A's own intent tags as evidence rather than discarding them.
    for (const intent of keyword.intent) {
      addVote(intent, 2, 'Tagged by keyword-signal extraction (Sprint 11A).');
    }

    // Independent phrase-pattern evidence.
    for (const rule of PATTERN_RULES) {
      if (rule.pattern.test(keyword.normalizedKeyword)) addVote(rule.intent, rule.weight, rule.reason);
    }

    // Category/feature-sourced phrases are solution-oriented even without a
    // literal keyword match (e.g. "candidate assessment software" itself).
    if (keyword.sources.some((s) => s === 'market_category' || s === 'market_term' || s === 'feature')) {
      addVote('solution', 3, 'Derived from a category/feature-oriented product signal.');
    }
    if (keyword.sources.includes('audience')) {
      addVote('audience_specific', 2, 'Derived from an audience-targeted signal.');
    }

    if (isBrandOnly) {
      // Force navigational regardless of any incidental pattern matches.
      const nav = votes.get('navigational')!;
      const secondaryIntents = Array.from(votes.keys()).filter((i) => i !== 'navigational');
      return this.buildProfile(keyword, 'navigational', secondaryIntents, nav.score, nav.reasons, []);
    }

    if (votes.size === 0) {
      return this.buildProfile(
        keyword,
        'informational',
        [],
        0,
        ['No strong intent signals were detected; defaulted to informational.'],
        ['Intent classification is a low-confidence fallback for this keyword.'],
      );
    }

    const sorted = Array.from(votes.entries()).sort((a, b) => {
      if (b[1].score !== a[1].score) return b[1].score - a[1].score;
      return PRECEDENCE.indexOf(a[0]) - PRECEDENCE.indexOf(b[0]);
    });

    const [primaryIntent, primaryVote] = sorted[0];
    const isTie = sorted.length > 1 && sorted[1][1].score === primaryVote.score;
    const secondaryIntents = sorted.slice(1, 4).map(([intent]) => intent);
    const warnings = isTie ? ['Multiple intents were equally supported; primary intent chosen by deterministic precedence.'] : [];

    return this.buildProfile(keyword, primaryIntent, secondaryIntents, primaryVote.score, primaryVote.reasons, warnings, isTie, votes.size);
  }

  private buildProfile(
    keyword: KeywordSignal,
    primaryIntent: SearchIntentPrimary,
    secondaryIntents: SearchIntentPrimary[],
    primaryScore: number,
    reasons: string[],
    warnings: string[],
    isTie = false,
    intentCount = secondaryIntents.length + 1,
  ): KeywordIntentProfile {
    const intentScore = this.clamp(Math.round(20 + primaryScore * 10), 0, 100);

    let confidence = Math.round(keyword.confidenceScore * 0.4 + intentScore * 0.4);
    confidence += Math.min(20, keyword.sources.length * 4);
    if (intentCount >= 3) confidence -= 10;
    if (isTie) confidence -= 10;
    if (primaryScore === 0) confidence = Math.min(confidence, 30);
    const confidenceScore = this.clamp(confidence, 0, 100);

    return {
      keyword: keyword.keyword,
      normalizedKeyword: keyword.normalizedKeyword,
      primaryIntent,
      secondaryIntents,
      funnelStage: this.computeFunnelStage(primaryIntent, secondaryIntents),
      intentScore,
      confidenceScore,
      reasons,
      warnings,
    };
  }

  private computeFunnelStage(primaryIntent: SearchIntentPrimary, secondaryIntents: SearchIntentPrimary[]): KeywordFunnelStage {
    const stages = new Set<KeywordFunnelStage>([FUNNEL_BY_INTENT[primaryIntent], ...secondaryIntents.map((i) => FUNNEL_BY_INTENT[i])]);
    if (stages.has('awareness') && stages.has('decision')) return 'mixed';
    if (stages.size >= 3) return 'mixed';
    return FUNNEL_BY_INTENT[primaryIntent];
  }

  private dedupe(items: string[]): string[] {
    return Array.from(new Set(items.filter((i) => i && i.trim())));
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
