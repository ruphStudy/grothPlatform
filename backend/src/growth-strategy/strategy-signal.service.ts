import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { StrategySignal, StrategySignalCategory, StrategySignalExtractionInput, StrategySignalResult } from './types/strategy-signal.types';

const DEFAULT_MAX_TOTAL = 50;
const DEFAULT_MAX_STRONGEST = 12;
const DEFAULT_MAX_EVIDENCE = 8;

interface RawSignal {
  category: StrategySignalCategory;
  title: string;
  value: string;
  strengthScore: number;
  confidenceScore: number;
  source: string;
  evidence: string[];
  relatedSegmentIds?: string[];
  relatedKeywords?: string[];
  relatedUseCases?: string[];
  warnings?: string[];
}

@Injectable()
export class StrategySignalService {
  constructor(private readonly configService: ConfigService) {}

  extract(input: StrategySignalExtractionInput): StrategySignalResult {
    const raw: RawSignal[] = [
      ...this.extractProductSignals(input),
      ...this.extractMarketSignals(input),
      ...this.extractAudienceSignals(input),
      ...this.extractKeywordSignals(input),
    ];

    const merged = this.dedupeAndMerge(raw)
      .sort((a, b) => b.strengthScore - a.strengthScore || b.confidenceScore - a.confidenceScore || a.id.localeCompare(b.id))
      .slice(0, this.getMaxTotal());

    const bucket = (predicate: (s: StrategySignal) => boolean) => merged.filter(predicate).map((s) => s.id);

    const productSignals = bucket((s) => s.category === 'product' || s.category === 'positioning');
    const audienceSignals = bucket((s) => s.category === 'audience' || s.category === 'pain' || s.category === 'jtbd' || s.category === 'commercial');
    const marketSignals = bucket((s) => s.category === 'market' || s.category === 'competitor');
    const keywordSignals = bucket((s) => s.category === 'keyword');
    const differentiationSignals = bucket((s) => s.category === 'differentiation');

    const strongestSignalIds = merged.slice(0, this.getMaxStrongest()).map((s) => s.id);

    const confidenceScore = merged.length ? Math.round(merged.reduce((sum, s) => sum + s.confidenceScore, 0) / merged.length) : 0;

    return {
      signals: merged,
      strongestSignalIds,
      productSignals,
      audienceSignals,
      marketSignals,
      keywordSignals,
      differentiationSignals,
      confidenceScore,
      missingEvidence: this.buildMissingEvidence(input, differentiationSignals.length > 0),
      warnings: this.buildWarnings(input),
      generatedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------
  // Product / positioning
  // ---------------------------------------------------------------------

  private extractProductSignals(input: StrategySignalExtractionInput): RawSignal[] {
    const out: RawSignal[] = [];
    const profile = input.productProfile;
    const profileConfidence = profile?.confidenceScore ?? 50;

    if (input.marketCategory.primaryCategory) {
      out.push({
        category: 'product',
        title: 'Product Category',
        value: input.marketCategory.primaryCategory,
        strengthScore: 70,
        confidenceScore: input.marketCategory.confidenceScore,
        source: 'market_category',
        evidence: [input.marketCategory.primaryCategory, ...input.marketCategory.categoryTerms.slice(0, 2)],
      });
    }

    if (profile?.valueProposition) {
      out.push({
        category: 'positioning',
        title: 'Value Proposition',
        value: profile.valueProposition,
        strengthScore: 75,
        confidenceScore: profileConfidence,
        source: 'product_intelligence_profile',
        evidence: [profile.valueProposition],
      });
    }
    if (profile?.suggestedPositioning) {
      out.push({
        category: 'positioning',
        title: 'Suggested Positioning',
        value: profile.suggestedPositioning,
        strengthScore: 65,
        confidenceScore: profileConfidence,
        source: 'product_intelligence_profile',
        evidence: [profile.suggestedPositioning],
      });
    }
    if (profile?.businessModel) {
      out.push({
        category: 'product',
        title: 'Business Model',
        value: profile.businessModel,
        strengthScore: 60,
        confidenceScore: profileConfidence,
        source: 'product_intelligence_profile',
        evidence: [profile.businessModel],
      });
    } else if (input.audienceSignals.businessModelSignals.length > 0) {
      out.push({
        category: 'product',
        title: 'Business Model',
        value: input.audienceSignals.businessModelSignals[0],
        strengthScore: 50,
        confidenceScore: input.audienceSignals.confidenceScore,
        source: 'audience_signals',
        evidence: input.audienceSignals.businessModelSignals.slice(0, 2),
      });
    }

    for (const feature of (profile?.coreFeatures ?? []).slice(0, 2)) {
      out.push({
        category: 'product',
        title: 'Core Feature',
        value: feature,
        strengthScore: 60,
        confidenceScore: profileConfidence,
        source: 'product_intelligence_profile',
        evidence: [feature],
      });
    }

    for (const diff of (profile?.differentiators ?? []).slice(0, 3)) {
      out.push({
        category: 'differentiation',
        title: 'Product Differentiator',
        value: diff,
        strengthScore: 75,
        confidenceScore: profileConfidence,
        source: 'product_intelligence_profile',
        evidence: [diff],
      });
    }

    return out;
  }

  // ---------------------------------------------------------------------
  // Market / competitor
  // ---------------------------------------------------------------------

  private extractMarketSignals(input: StrategySignalExtractionInput): RawSignal[] {
    const out: RawSignal[] = [];
    const fc = input.featureComparison;

    if (fc?.commonCapabilities.length) {
      out.push({
        category: 'market',
        title: 'Common Market Capability',
        value: fc.commonCapabilities[0],
        strengthScore: 40,
        confidenceScore: fc.confidenceScore,
        source: 'feature_comparison',
        evidence: fc.commonCapabilities.slice(0, 2),
      });
    }

    // Cross-reference feature gaps with own keyword-gap evidence — one
    // consolidated "coverage gap" signal instead of two separate mentions.
    const gapKeywordByCapability = new Map((input.competitorKeywordGaps?.gaps ?? []).map((g) => [g.normalizedKeyword, g]));
    for (const gap of [...(fc?.possibleFeatureGaps ?? [])].sort((a, b) => b.importanceScore - a.importanceScore).slice(0, 2)) {
      const normalizedCapability = gap.capability.toLowerCase().trim();
      const matchingKeywordGap = gapKeywordByCapability.get(normalizedCapability);
      const evidence = [`Mentioned by ${gap.competitorCount} competitor(s): ${gap.competitors.join(', ')}.`];
      let title = 'Possible Feature Gap';
      let strengthScore = this.clamp(gap.importanceScore, 0, 100);
      let confidenceScore = fc?.confidenceScore ?? 50;
      let source = 'feature_comparison';

      if (matchingKeywordGap && (matchingKeywordGap.gapType === 'missing' || matchingKeywordGap.gapType === 'weak_coverage')) {
        title = 'Competitive Coverage Gap';
        evidence.push(...matchingKeywordGap.reasons.slice(0, 2));
        strengthScore = Math.max(strengthScore, matchingKeywordGap.opportunityScore);
        confidenceScore = Math.round((confidenceScore + matchingKeywordGap.confidenceScore) / 2);
        source = 'feature_comparison+keyword_gap';
      }

      out.push({
        category: 'competitor',
        title,
        value: gap.capability,
        strengthScore,
        confidenceScore,
        source,
        evidence,
        relatedKeywords: matchingKeywordGap ? [matchingKeywordGap.keyword] : undefined,
      });
    }

    for (const opp of [...(input.positioning?.opportunities ?? [])].sort((a, b) => b.confidenceScore - a.confidenceScore).slice(0, 2)) {
      out.push({
        category: 'market',
        title: 'Positioning Opportunity',
        value: opp.theme,
        strengthScore: 60,
        confidenceScore: opp.confidenceScore,
        source: 'positioning_analysis',
        evidence: [opp.reason],
      });
    }

    for (const opp of input.marketGaps?.strongestOpportunities.slice(0, 2) ?? []) {
      out.push({
        category: opp.category === 'differentiation' ? 'differentiation' : 'market',
        title: opp.title,
        value: opp.description,
        strengthScore: opp.priorityScore,
        confidenceScore: opp.confidenceScore,
        source: 'market_gap_analysis',
        evidence: [opp.caution],
      });
    }

    return out;
  }

  // ---------------------------------------------------------------------
  // Audience / pain / JTBD
  // ---------------------------------------------------------------------

  private extractAudienceSignals(input: StrategySignalExtractionInput): RawSignal[] {
    const out: RawSignal[] = [];
    const segmentById = new Map(input.segments.segments.map((s) => [s.id, s]));

    const primaryPriority = input.prioritization.priorities.find((p) => p.segmentId === input.prioritization.primarySegmentId);
    if (primaryPriority) {
      out.push({
        category: 'audience',
        title: 'Primary Audience',
        value: primaryPriority.segmentName,
        strengthScore: primaryPriority.priorityScore,
        confidenceScore: primaryPriority.confidenceScore,
        source: 'audience_prioritization',
        evidence: primaryPriority.reasons.slice(0, 2),
        relatedSegmentIds: [primaryPriority.segmentId],
        relatedUseCases: primaryPriority.useCases,
      });
    }
    for (const segmentId of input.prioritization.secondarySegmentIds.slice(0, 2)) {
      const priority = input.prioritization.priorities.find((p) => p.segmentId === segmentId);
      if (!priority) continue;
      out.push({
        category: 'audience',
        title: 'Secondary Audience',
        value: priority.segmentName,
        strengthScore: priority.priorityScore,
        confidenceScore: priority.confidenceScore,
        source: 'audience_prioritization',
        evidence: priority.reasons.slice(0, 2),
        relatedSegmentIds: [priority.segmentId],
        relatedUseCases: priority.useCases,
      });
    }

    const primaryIcp = input.icp.candidates.find((c) => c.id === input.icp.primaryIcpId);
    if (primaryIcp) {
      out.push({
        category: 'audience',
        title: 'Ideal Customer Profile',
        value: primaryIcp.segmentName,
        strengthScore: primaryIcp.fitScore,
        confidenceScore: primaryIcp.confidenceScore,
        source: 'icp',
        evidence: primaryIcp.reasons.slice(0, 2),
        relatedSegmentIds: [primaryIcp.segmentId],
        relatedUseCases: primaryIcp.useCases,
      });
    }

    const buyerEntity = input.buyerUserMap.entities.find((e) => e.segmentId === input.buyerUserMap.primaryBuyerSegmentId);
    const userEntity = input.buyerUserMap.entities.find((e) => e.segmentId === input.buyerUserMap.primaryUserSegmentId);
    if (buyerEntity && buyerEntity.segmentId !== userEntity?.segmentId) {
      out.push({
        category: 'commercial',
        title: 'Buyer Role',
        value: buyerEntity.segmentName,
        strengthScore: 65,
        confidenceScore: buyerEntity.confidenceScore,
        source: 'buyer_user_map',
        evidence: buyerEntity.reasons.slice(0, 2),
        relatedSegmentIds: [buyerEntity.segmentId],
      });
    }

    for (const painId of input.painPoints.strongestPainPointIds.slice(0, 2)) {
      const pain = input.painPoints.painPoints.find((p) => p.id === painId);
      if (!pain) continue;
      out.push({
        category: 'pain',
        title: pain.title,
        value: pain.description,
        strengthScore: pain.severityScore,
        confidenceScore: pain.confidenceScore,
        source: 'audience_pain_points',
        evidence: [pain.description],
        relatedSegmentIds: [pain.segmentId],
        relatedUseCases: pain.relatedUseCases,
        warnings: [pain.caution],
      });
    }

    for (const jobId of input.jtbd.strongestJobIds.slice(0, 2)) {
      const job = input.jtbd.jobs.find((j) => j.id === jobId);
      if (!job) continue;
      out.push({
        category: 'jtbd',
        title: 'Job to Be Done',
        value: job.statement,
        strengthScore: job.priorityScore,
        confidenceScore: job.confidenceScore,
        source: 'audience_jtbd',
        evidence: [job.statement],
        relatedSegmentIds: [job.segmentId],
        relatedUseCases: job.relatedUseCases,
        warnings: [job.caution],
      });
    }

    // Segment-level use-case signal for the primary segment, when informative.
    const primarySegment = input.prioritization.primarySegmentId ? segmentById.get(input.prioritization.primarySegmentId) : undefined;
    if (primarySegment && primarySegment.useCases.length > 0) {
      out.push({
        category: 'audience',
        title: 'Primary Use Case',
        value: primarySegment.useCases[0],
        strengthScore: primarySegment.confidenceScore,
        confidenceScore: primarySegment.confidenceScore,
        source: 'audience_segments',
        evidence: primarySegment.evidence.slice(0, 2),
        relatedSegmentIds: [primarySegment.id],
        relatedUseCases: [primarySegment.useCases[0]],
      });
    }

    return out;
  }

  // ---------------------------------------------------------------------
  // Keyword
  // ---------------------------------------------------------------------

  private extractKeywordSignals(input: StrategySignalExtractionInput): RawSignal[] {
    const out: RawSignal[] = [];

    for (const opp of [...input.keywordOpportunities.opportunities].filter((o) => o.tier === 'high').slice(0, 3)) {
      out.push({
        category: 'keyword',
        title: 'High-Opportunity Keyword',
        value: opp.keyword,
        strengthScore: opp.opportunityScore,
        confidenceScore: opp.confidenceScore,
        source: 'keyword_opportunity',
        evidence: opp.reasons.slice(0, 2),
        relatedKeywords: [opp.keyword],
      });
    }

    for (const cluster of [...input.keywordClusters.clusters].filter((c) => c.coherenceScore >= 70).sort((a, b) => b.confidenceScore - a.confidenceScore).slice(0, 2)) {
      out.push({
        category: 'keyword',
        title: 'Strong Keyword Cluster',
        value: cluster.name,
        strengthScore: cluster.coherenceScore,
        confidenceScore: cluster.confidenceScore,
        source: 'keyword_cluster',
        evidence: cluster.keywords.slice(0, 3),
        relatedKeywords: cluster.keywords.slice(0, this.getMaxEvidence()),
      });
    }

    const strongestLongTail = input.keywordLongTail.strongestKeywords[0];
    if (strongestLongTail) {
      const k = input.keywordLongTail.keywords.find((kw) => kw.keyword === strongestLongTail);
      out.push({
        category: 'keyword',
        title: 'Long-Tail Opportunity',
        value: strongestLongTail,
        strengthScore: k?.opportunityScore ?? 50,
        confidenceScore: k?.confidenceScore ?? 40,
        source: 'keyword_long_tail',
        evidence: k?.reasons.slice(0, 2) ?? [],
        relatedKeywords: [strongestLongTail],
      });
    }

    for (const keyword of (input.competitorKeywordGaps?.differentiationKeywords ?? []).slice(0, 2)) {
      const gap = input.competitorKeywordGaps?.gaps.find((g) => g.keyword === keyword);
      out.push({
        category: 'differentiation',
        title: 'Keyword Differentiation',
        value: keyword,
        strengthScore: gap?.opportunityScore ?? 60,
        confidenceScore: gap?.confidenceScore ?? 50,
        source: 'competitor_keyword_gap',
        evidence: gap?.reasons.slice(0, 2) ?? [],
        relatedKeywords: [keyword],
      });
    }

    return out;
  }

  // ---------------------------------------------------------------------
  // Merge / dedup
  // ---------------------------------------------------------------------

  private dedupeAndMerge(raw: RawSignal[]): StrategySignal[] {
    const map = new Map<string, StrategySignal>();

    for (const r of raw) {
      const key = `${r.category}|${this.normalize(r.value)}`;
      const existing = map.get(key);

      if (!existing) {
        map.set(key, {
          id: this.slugify(key),
          category: r.category,
          title: r.title,
          value: r.value,
          strengthScore: this.clamp(r.strengthScore, 0, 100),
          confidenceScore: this.clamp(r.confidenceScore, 0, 100),
          source: r.source,
          evidence: this.dedupe(r.evidence).slice(0, this.getMaxEvidence()),
          relatedSegmentIds: r.relatedSegmentIds,
          relatedKeywords: r.relatedKeywords,
          relatedUseCases: r.relatedUseCases,
          warnings: this.dedupe(r.warnings ?? []),
        });
        continue;
      }

      const sources = new Set([...existing.source.split('+'), ...r.source.split('+')]);
      existing.source = Array.from(sources).join('+');
      existing.evidence = this.dedupe([...existing.evidence, ...r.evidence]).slice(0, this.getMaxEvidence());
      existing.relatedSegmentIds = this.dedupe([...(existing.relatedSegmentIds ?? []), ...(r.relatedSegmentIds ?? [])]);
      existing.relatedKeywords = this.dedupe([...(existing.relatedKeywords ?? []), ...(r.relatedKeywords ?? [])]);
      existing.relatedUseCases = this.dedupe([...(existing.relatedUseCases ?? []), ...(r.relatedUseCases ?? [])]);
      existing.warnings = this.dedupe([...existing.warnings, ...(r.warnings ?? [])]);
      if (r.strengthScore > existing.strengthScore) {
        existing.strengthScore = this.clamp(r.strengthScore, 0, 100);
        existing.title = r.title;
      }
      existing.confidenceScore = this.clamp(Math.max(existing.confidenceScore, r.confidenceScore) + Math.min(10, (sources.size - 1) * 5), 0, 100);
    }

    return Array.from(map.values());
  }

  // ---------------------------------------------------------------------
  // Missing evidence / warnings
  // ---------------------------------------------------------------------

  private buildMissingEvidence(input: StrategySignalExtractionInput, hasDifferentiation: boolean): string[] {
    const missing: string[] = [];
    if (!input.prioritization.primarySegmentId) missing.push('No clear primary audience was identified.');
    if (!input.icp.primaryIcpId) missing.push('No strong ICP candidate was identified.');
    if (!input.buyerUserMap.primaryBuyerSegmentId && input.audienceSignals.businessModelSignals.some((b) => b.toLowerCase().includes('b2b'))) {
      missing.push('No buyer evidence was found for a B2B-style purchase decision.');
    }
    if (!input.keywordOpportunities.opportunities.some((o) => o.tier === 'high')) {
      missing.push('No high-opportunity keywords were identified.');
    }
    if (!input.competitorKeywordGaps) missing.push('Competitor research is unavailable; competitive positioning evidence is limited.');
    if (!hasDifferentiation) missing.push('No differentiation evidence was found relative to competitors.');
    missing.push('No validated market-size or revenue data is available; signals are evidence-based, not financial projections.');
    return missing;
  }

  private buildWarnings(input: StrategySignalExtractionInput): string[] {
    const warnings = [
      'Growth-strategy signals are synthesized from existing product, market, audience, and keyword evidence and are not validated business outcomes.',
    ];
    if (!input.competitorKeywordGaps) {
      warnings.push('Competitor research is unavailable; market and competitive signals rely on internal evidence only.');
    }
    return this.dedupe(warnings);
  }

  // ---------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------

  private normalize(value: string): string {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  private slugify(key: string): string {
    return key
      .toLowerCase()
      .replace(/[^a-z0-9|]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .replace(/\|/g, '-');
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

  private getMaxTotal(): number {
    return this.getEnvNumber('STRATEGY_SIGNAL_MAX_TOTAL', DEFAULT_MAX_TOTAL);
  }

  private getMaxStrongest(): number {
    return this.getEnvNumber('STRATEGY_SIGNAL_MAX_STRONGEST', DEFAULT_MAX_STRONGEST);
  }

  private getMaxEvidence(): number {
    return this.getEnvNumber('STRATEGY_SIGNAL_MAX_EVIDENCE', DEFAULT_MAX_EVIDENCE);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
