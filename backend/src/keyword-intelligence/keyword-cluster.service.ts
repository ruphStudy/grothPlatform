import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { KeywordIntentProfile, KeywordIntentResult, SearchIntentPrimary } from './types/keyword-intent.types';
import type { KeywordCluster, KeywordClusterResult, KeywordClusterType } from './types/keyword-cluster.types';
import type { KeywordSignal, KeywordSignalResult, KeywordSignalSource } from './types/keyword-signal.types';

const DEFAULT_MIN_SIMILARITY = 0.45;
const DEFAULT_MAX_CLUSTERS = 25;
const DEFAULT_MAX_KEYWORDS_PER_CLUSTER = 20;

// A solo keyword may stand as its own cluster only above this avg-confidence bar.
const STRONG_SOLO_CONFIDENCE = 55;

const STOPWORDS = new Set(['for', 'the', 'a', 'an', 'to', 'of', 'with', 'and', 'best']);
const GENERIC_TOKENS = new Set(['software', 'platform', 'tool', 'solution', 'service']);
const GENERIC_TOKEN_WEIGHT = 0.25;

// Unordered intent-pair compatibility — reduces (never fully blocks) similarity on mismatch.
const COMPATIBLE_INTENT_PAIRS = new Set([
  'commercial|solution',
  'comparison|commercial',
  'informational|problem',
  'audience_specific|solution',
  'commercial|transactional',
  'comparison|transactional',
]);

const SOURCE_TO_CLUSTER_TYPE: Partial<Record<KeywordSignalSource, KeywordClusterType>> = {
  market_category: 'category',
  market_term: 'category',
  product_description: 'category',
  website_identity: 'category',
  competitor_gap: 'category',
  feature: 'feature',
  use_case: 'use_case',
  jtbd: 'use_case',
  audience: 'audience',
  pain_point: 'problem',
  product_name: 'brand',
  pricing: 'commercial',
};

interface Entry {
  signal: KeywordSignal;
  profile: KeywordIntentProfile;
  tokenWeights: Map<string, number>;
}

@Injectable()
export class KeywordClusterService {
  constructor(private readonly configService: ConfigService) {}

  cluster(signals: KeywordSignalResult, intents: KeywordIntentResult): KeywordClusterResult {
    const profileByKey = new Map(intents.profiles.map((p) => [p.normalizedKeyword, p]));
    const entries: Entry[] = signals.keywords
      .map((signal) => {
        const profile = profileByKey.get(signal.normalizedKeyword);
        if (!profile) return null;
        return { signal, profile, tokenWeights: this.weightedTokens(signal.normalizedKeyword) };
      })
      .filter((e): e is Entry => e !== null);

    const sorted = [...entries].sort((a, b) => {
      const scoreA = (a.signal.confidenceScore + a.profile.confidenceScore) / 2;
      const scoreB = (b.signal.confidenceScore + b.profile.confidenceScore) / 2;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.signal.normalizedKeyword.localeCompare(b.signal.normalizedKeyword);
    });

    const threshold = this.getMinSimilarity();
    const maxPerCluster = this.getMaxKeywordsPerCluster();
    const assigned = new Set<string>();
    const rawGroups: Entry[][] = [];

    for (const seed of sorted) {
      if (assigned.has(seed.signal.normalizedKeyword)) continue;
      assigned.add(seed.signal.normalizedKeyword);

      const candidates: { entry: Entry; sim: number }[] = [];
      for (const other of sorted) {
        if (assigned.has(other.signal.normalizedKeyword)) continue;
        const sim = this.similarity(seed, other);
        if (sim >= threshold) candidates.push({ entry: other, sim });
      }
      candidates.sort((a, b) => b.sim - a.sim);
      const accepted = candidates.slice(0, Math.max(0, maxPerCluster - 1));
      for (const c of accepted) assigned.add(c.entry.signal.normalizedKeyword);

      rawGroups.push([seed, ...accepted.map((c) => c.entry)]);
    }

    const unclustered: Entry[] = [];
    const groups: Entry[][] = [];
    for (const group of rawGroups) {
      if (group.length === 1) {
        const solo = group[0];
        const avgConf = (solo.signal.confidenceScore + solo.profile.confidenceScore) / 2;
        if (avgConf < STRONG_SOLO_CONFIDENCE) {
          unclustered.push(solo);
          continue;
        }
      }
      groups.push(group);
    }

    // Keep the strongest groups when over capacity; overflow goes unclustered.
    groups.sort((a, b) => {
      const scoreOf = (g: Entry[]) => g.length * 10 + this.avgConfidence(g);
      return scoreOf(b) - scoreOf(a);
    });
    const maxClusters = this.getMaxClusters();
    const kept = groups.slice(0, maxClusters);
    for (const overflowGroup of groups.slice(maxClusters)) unclustered.push(...overflowGroup);

    const clusters = kept.map((members, i) => this.buildCluster(members, i));

    const unclusteredKeywords = this.dedupe(unclustered.map((e) => e.signal.keyword));
    const confidenceScore = clusters.length
      ? Math.round(clusters.reduce((sum, c) => sum + c.confidenceScore, 0) / clusters.length)
      : 0;

    const warnings = [
      'Keyword clusters are derived from deterministic phrase and evidence similarity; they do not reflect verified search-demand grouping or SERP topical clusters.',
    ];
    if (entries.length > 0 && unclusteredKeywords.length / entries.length >= 0.5) {
      warnings.push('Many keywords could not be confidently clustered and remain unclustered.');
    }

    return {
      clusters,
      unclusteredKeywords,
      confidenceScore,
      warnings: this.dedupe(warnings),
      generatedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------
  // Similarity
  // ---------------------------------------------------------------------

  private similarity(a: Entry, b: Entry): number {
    const tokenScore = this.tokenOverlap(a.tokenWeights, b.tokenWeights);
    const useCaseScore = this.intersects(a.signal.relatedUseCases, b.signal.relatedUseCases) ? 1 : 0;
    const segmentScore = this.intersects(a.signal.relatedSegments, b.signal.relatedSegments) ? 1 : 0;
    const intentScore = this.intentCompatibility(a.profile.primaryIntent, b.profile.primaryIntent);
    const sourceScore = this.jaccard(a.signal.sources, b.signal.sources);

    let score = tokenScore * 0.5 + useCaseScore * 0.2 + segmentScore * 0.15 + intentScore * 0.1 + sourceScore * 0.05;

    const aBrand = this.isBrandOnly(a.signal);
    const bBrand = this.isBrandOnly(b.signal);
    if (aBrand !== bBrand) score *= 0.5; // don't merge brand into generic category terms without strong shared evidence

    return score;
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

  private intentCompatibility(a: SearchIntentPrimary, b: SearchIntentPrimary): number {
    if (a === b) return 1;
    const key = [a, b].sort().join('|');
    if (COMPATIBLE_INTENT_PAIRS.has(key)) return 1;
    if (a === 'navigational' || b === 'navigational') return 0.1;
    return 0.4;
  }

  private jaccard(a: string[], b: string[]): number {
    if (a.length === 0 && b.length === 0) return 0;
    const setA = new Set(a);
    const setB = new Set(b);
    const union = new Set([...setA, ...setB]);
    let inter = 0;
    for (const x of setA) if (setB.has(x)) inter++;
    return union.size > 0 ? inter / union.size : 0;
  }

  private intersects(a?: string[], b?: string[]): boolean {
    if (!a?.length || !b?.length) return false;
    const setB = new Set(b);
    return a.some((x) => setB.has(x));
  }

  private isBrandOnly(signal: KeywordSignal): boolean {
    return signal.sources.length === 1 && signal.sources[0] === 'product_name';
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

  // ---------------------------------------------------------------------
  // Cluster assembly
  // ---------------------------------------------------------------------

  private buildCluster(members: Entry[], index: number): KeywordCluster {
    const primary = this.selectPrimary(members);
    const others = members.filter((m) => m !== primary);

    const sims = others.map((m) => this.similarity(primary, m));
    const coherenceScore =
      members.length === 1 ? 70 : this.clamp(Math.round((sims.reduce((s, v) => s + v, 0) / sims.length) * 100), 0, 100);

    const avgKeywordConfidence = this.avgConfidence(members, (m) => m.signal.confidenceScore);
    const avgIntentConfidence = this.avgConfidence(members, (m) => m.profile.confidenceScore);
    const distinctSources = new Set(members.flatMap((m) => m.signal.sources)).size;
    const confidenceScore = this.clamp(
      Math.round(
        avgKeywordConfidence * 0.45 +
          avgIntentConfidence * 0.35 +
          Math.min(10, distinctSources * 2) +
          Math.min(10, (members.length - 1) * 3),
      ),
      0,
      100,
    );

    const relatedUseCases = this.dedupe(members.flatMap((m) => m.signal.relatedUseCases ?? []));
    const relatedSegments = this.dedupe(members.flatMap((m) => m.signal.relatedSegments ?? []));
    const funnelStages = this.dedupe(members.map((m) => m.profile.funnelStage)).sort();
    const intents = this.dedupe(members.map((m) => m.profile.primaryIntent)).sort();

    const sharedTokens = this.sharedMeaningfulTokens(members);
    const type = this.determineType(members, primary);
    const name = this.buildClusterName(primary, sharedTokens);

    const reasons: string[] = [];
    if (sharedTokens.length > 0) reasons.push(`Members share meaningful term(s): ${sharedTokens.join(', ')}.`);
    if (relatedUseCases.length > 0) reasons.push(`Members share related use case(s): ${relatedUseCases.join(', ')}.`);
    if (relatedSegments.length > 0) reasons.push('Members share related audience segment(s).');
    if (type === 'brand') reasons.push('Kept as a standalone brand cluster; not merged with generic category terms.');
    if (members.length === 1) reasons.push('Standalone strong keyword with no sufficiently similar companions above the similarity threshold.');

    const warnings: string[] = [];
    if (coherenceScore < 50) warnings.push('Cluster coherence is low; members may be loosely related.');

    return {
      id: `cluster-${index + 1}-${primary.signal.normalizedKeyword.replace(/\s+/g, '-')}`,
      name,
      type,
      primaryKeyword: primary.signal.keyword,
      keywords: members.map((m) => m.signal.keyword),
      primaryIntent: primary.profile.primaryIntent,
      intents,
      funnelStages,
      relatedSegments,
      relatedUseCases,
      coherenceScore,
      confidenceScore,
      reasons,
      warnings,
    };
  }

  private selectPrimary(members: Entry[]): Entry {
    return [...members].sort((a, b) => {
      if (b.signal.confidenceScore !== a.signal.confidenceScore) return b.signal.confidenceScore - a.signal.confidenceScore;
      if (b.profile.confidenceScore !== a.profile.confidenceScore) return b.profile.confidenceScore - a.profile.confidenceScore;
      const wordsA = a.signal.normalizedKeyword.split(' ').length;
      const wordsB = b.signal.normalizedKeyword.split(' ').length;
      if (wordsA !== wordsB) return wordsA - wordsB;
      return a.signal.normalizedKeyword.localeCompare(b.signal.normalizedKeyword);
    })[0];
  }

  private sharedMeaningfulTokens(members: Entry[]): string[] {
    if (members.length === 0) return [];
    let shared: Set<string> | undefined;
    for (const m of members) {
      const meaningful = new Set([...m.tokenWeights.entries()].filter(([, w]) => w === 1).map(([t]) => t));
      shared = shared ? new Set([...shared].filter((t) => meaningful.has(t))) : meaningful;
    }
    return Array.from(shared ?? []).sort();
  }

  private determineType(members: Entry[], primary: Entry): KeywordClusterType {
    if (members.every((m) => this.isBrandOnly(m.signal))) return 'brand';

    const counts = new Map<KeywordClusterType, number>();
    for (const m of members) {
      for (const s of m.signal.sources) {
        const t = SOURCE_TO_CLUSTER_TYPE[s];
        if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    const sortedCounts = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    if (sortedCounts.length > 0 && (sortedCounts.length === 1 || sortedCounts[0][1] > sortedCounts[1][1])) {
      return sortedCounts[0][0];
    }

    const commercialShare = members.filter((m) => m.profile.primaryIntent === 'commercial' || m.profile.primaryIntent === 'comparison').length / members.length;
    if (commercialShare >= 0.6) return 'commercial';

    return sortedCounts[0]?.[0] ?? 'mixed';
  }

  private buildClusterName(primary: Entry, sharedTokens: string[]): string {
    const words = primary.signal.keyword.split(/\s+/).filter(Boolean);
    const meaningful = words.filter((w) => {
      const lower = w.toLowerCase();
      return !STOPWORDS.has(lower) && !GENERIC_TOKENS.has(lower);
    });
    const candidate = (meaningful.length > 0 ? meaningful : words).slice(0, 4).join(' ').trim();
    return candidate || primary.signal.keyword;
  }

  // ---------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------

  private avgConfidence(members: Entry[], pick: (m: Entry) => number = (m) => (m.signal.confidenceScore + m.profile.confidenceScore) / 2): number {
    if (members.length === 0) return 0;
    return members.reduce((sum, m) => sum + pick(m), 0) / members.length;
  }

  private dedupe(items: string[]): string[] {
    return Array.from(new Set(items.filter((i) => i && i.trim())));
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private getMinSimilarity(): number {
    const raw = this.configService.get<string>('KEYWORD_CLUSTER_MIN_SIMILARITY');
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : DEFAULT_MIN_SIMILARITY;
  }

  private getMaxClusters(): number {
    return this.getEnvNumber('KEYWORD_CLUSTER_MAX_CLUSTERS', DEFAULT_MAX_CLUSTERS);
  }

  private getMaxKeywordsPerCluster(): number {
    return this.getEnvNumber('KEYWORD_CLUSTER_MAX_KEYWORDS_PER_CLUSTER', DEFAULT_MAX_KEYWORDS_PER_CLUSTER);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
