import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AudienceJtbdService } from './audience-jtbd.service';
import { AudiencePainPointService } from './audience-pain-point.service';
import { AudienceSegmentService } from './audience-segment.service';
import { AudienceSignalService } from './audience-signal.service';
import { BuyerUserMapService } from './buyer-user-map.service';
import { IcpService } from './icp.service';
import type { AudienceSegment, AudienceSegmentResult } from './types/audience-segment.types';
import type { AudienceSignalResult } from './types/audience-signal.types';
import type { AudiencePainPointResult } from './types/audience-pain-point.types';
import type { AudienceJtbdResult } from './types/audience-jtbd.types';
import type { BuyerUserEntity, BuyerUserMapResult } from './types/buyer-user-map.types';
import type { IcpCandidate, IcpResult } from './types/icp.types';
import type { AudiencePriority, AudiencePriorityTier, AudiencePrioritizationResult } from './types/audience-prioritization.types';

const DEFAULT_PRIMARY_MIN_SCORE = 70;
const DEFAULT_PRIMARY_MIN_CONFIDENCE = 55;
const DEFAULT_SECONDARY_MIN_SCORE = 50;
const DEFAULT_EXPERIMENTAL_MIN_SCORE = 30;
const DEFAULT_MAX_SEGMENTS = 8;

const BUSINESS_LIKE_TYPES = new Set(['team', 'business', 'institution']);
const BUYER_LIKE_ROLES = new Set(['buyer', 'decision_maker', 'administrator', 'economic_buyer']);

interface ComponentScores {
  icp: number;
  segmentConfidence: number;
  jtbd: number;
  pain: number;
  commercial: number;
  useCase: number;
}

@Injectable()
export class AudiencePrioritizationService {
  constructor(
    private readonly configService: ConfigService,
    private readonly audienceSignalService: AudienceSignalService,
    private readonly audienceSegmentService: AudienceSegmentService,
    private readonly icpService: IcpService,
    private readonly buyerUserMapService: BuyerUserMapService,
    private readonly audiencePainPointService: AudiencePainPointService,
    private readonly audienceJtbdService: AudienceJtbdService,
  ) {}

  /**
   * Product-scoped orchestration. Runs 10A extraction once, then 10B–10F's
   * pure methods once each, then prioritize() (pure) — no website re-fetch,
   * no re-segmentation, no re-detection, no re-mapping, no re-identification,
   * no re-generation.
   */
  async prioritizeForProduct(
    organizationId: string,
    productId: string,
    userId: string,
  ): Promise<{
    signals: AudienceSignalResult;
    segments: AudienceSegmentResult;
    icp: IcpResult;
    buyerUserMap: BuyerUserMapResult;
    painPoints: AudiencePainPointResult;
    jtbd: AudienceJtbdResult;
    prioritization: AudiencePrioritizationResult;
  }> {
    const signals = await this.audienceSignalService.extractForProduct(organizationId, productId, userId);
    const segments = this.audienceSegmentService.construct(signals);
    const icp = this.icpService.detect({ signals, segments });
    const buyerUserMap = this.buyerUserMapService.map({ signals, segments, icp });
    const painPoints = this.audiencePainPointService.identify({ signals, segments, icp, buyerUserMap });
    const jtbd = this.audienceJtbdService.generate({ signals, segments, icp, buyerUserMap, painPoints });
    const prioritization = this.prioritize({ signals, segments, icp, buyerUserMap, painPoints, jtbd });
    return { signals, segments, icp, buyerUserMap, painPoints, jtbd, prioritization };
  }

  prioritize(input: {
    signals: AudienceSignalResult;
    segments: AudienceSegmentResult;
    icp: IcpResult;
    buyerUserMap: BuyerUserMapResult;
    painPoints: AudiencePainPointResult;
    jtbd: AudienceJtbdResult;
  }): AudiencePrioritizationResult {
    const { segments, icp, buyerUserMap, painPoints, jtbd } = input;
    const icpBySegmentId = new Map(icp.candidates.map((c) => [c.segmentId, c]));
    const entityBySegmentId = new Map(buyerUserMap.entities.map((e) => [e.segmentId, e]));

    const rawPriorities = segments.segments
      .map((segment) =>
        this.buildPriority(
          segment,
          icpBySegmentId.get(segment.id),
          entityBySegmentId.get(segment.id),
          painPoints,
          jtbd,
        ),
      )
      .sort((a, b) => b.priorityScore - a.priorityScore || b.confidenceScore - a.confidenceScore)
      .slice(0, this.getMaxSegments());

    // Select the single primary winner from segments that qualified for the
    // 'primary' tier (scoring/thresholds untouched above this point).
    const primaryCandidates = rawPriorities.filter((p) => p.tier === 'primary');
    const primary = primaryCandidates.sort(
      (a, b) => b.priorityScore - a.priorityScore || b.confidenceScore - a.confidenceScore || (b.icpFitScore ?? 0) - (a.icpFitScore ?? 0) || a.segmentId.localeCompare(b.segmentId),
    )[0];
    const primarySegmentId = primary?.segmentId;

    // Normalize: only the chosen winner keeps tier 'primary'. Any other
    // segment that independently qualified as 'primary' is downgraded to
    // 'secondary' so a segment's own tier field never disagrees with which
    // bucket (primarySegmentId / secondarySegmentIds) it actually lands in.
    // This is response-shape cleanup only — priorityScore/confidenceScore
    // are copied through unchanged.
    const priorities = rawPriorities.map((p) =>
      p.tier === 'primary' && p.segmentId !== primarySegmentId ? { ...p, tier: 'secondary' as const } : p,
    );

    const secondarySegmentIds = priorities
      .filter((p) => p.tier === 'secondary')
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .map((p) => p.segmentId);

    const experimentalSegmentIds = priorities
      .filter((p) => p.tier === 'experimental')
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .map((p) => p.segmentId);

    const confidenceScore = this.computeOverallConfidence(input, priorities);
    const rationale = this.buildRationale(priorities, primarySegmentId, secondarySegmentIds);
    const missingEvidence = this.buildMissingEvidence();
    const warnings = this.buildWarnings(priorities);

    return {
      priorities,
      primarySegmentId,
      secondarySegmentIds,
      experimentalSegmentIds,
      confidenceScore,
      rationale,
      missingEvidence,
      warnings,
      generatedAt: new Date(),
    };
  }

  private buildPriority(
    segment: AudienceSegment,
    icpCandidate: IcpCandidate | undefined,
    entity: BuyerUserEntity | undefined,
    painPoints: AudiencePainPointResult,
    jtbd: AudienceJtbdResult,
  ): AudiencePriority {
    const segmentPains = painPoints.painPoints.filter((p) => p.segmentId === segment.id);
    const segmentJobs = jtbd.jobs.filter((j) => j.segmentId === segment.id);
    const isBusinessLike = BUSINESS_LIKE_TYPES.has(segment.segmentType);
    const commercialRoles = entity?.commercialRoles ?? [];
    const hasBuyerClarity = commercialRoles.some((r) => BUYER_LIKE_ROLES.has(r));

    const components = this.computeComponents(segment, icpCandidate, entity, segmentPains, segmentJobs, isBusinessLike, hasBuyerClarity);

    const priorityScore = this.clamp(
      Math.round(
        components.icp * 0.3 +
          components.segmentConfidence * 0.2 +
          components.jtbd * 0.15 +
          components.pain * 0.15 +
          components.commercial * 0.1 +
          components.useCase * 0.1,
      ),
      0,
      100,
    );

    const avgJobConfidence = segmentJobs.length > 0 ? segmentJobs.reduce((s, j) => s + j.confidenceScore, 0) / segmentJobs.length : 0;
    const avgPainConfidence = segmentPains.length > 0 ? segmentPains.reduce((s, p) => s + p.confidenceScore, 0) / segmentPains.length : 0;

    const confidenceScore = this.clamp(
      Math.round(
        segment.confidenceScore * 0.3 +
          (icpCandidate?.confidenceScore ?? 0) * 0.25 +
          avgJobConfidence * 0.2 +
          avgPainConfidence * 0.15 +
          (entity?.confidenceScore ?? 50) * 0.1,
      ),
      0,
      100,
    );

    const tier = this.assignTier(priorityScore, confidenceScore);
    const strengths = this.buildStrengths(segment, components, hasBuyerClarity, isBusinessLike, segmentPains.length);
    const weaknesses = this.buildWeaknesses(segment, components, hasBuyerClarity, isBusinessLike, segmentPains.length);
    const reasons = this.buildReasons(components, hasBuyerClarity);

    return {
      segmentId: segment.id,
      segmentName: segment.name,
      priorityScore,
      confidenceScore,
      tier,
      icpFitScore: icpCandidate?.fitScore,
      roleSummary: [...segment.roles, ...segment.userTypes],
      useCases: segment.useCases,
      reasons,
      strengths,
      weaknesses,
      evidence: segment.evidence,
      warnings: [],
    };
  }

  private computeComponents(
    segment: AudienceSegment,
    icpCandidate: IcpCandidate | undefined,
    entity: BuyerUserEntity | undefined,
    segmentPains: AudiencePainPointResult['painPoints'],
    segmentJobs: AudienceJtbdResult['jobs'],
    isBusinessLike: boolean,
    hasBuyerClarity: boolean,
  ): ComponentScores {
    const icp = icpCandidate?.fitScore ?? 0;
    const segmentConfidence = segment.confidenceScore;

    const avgJobPriority = segmentJobs.length > 0 ? segmentJobs.reduce((s, j) => s + j.priorityScore, 0) / segmentJobs.length : 0;
    const avgJobConfidence = segmentJobs.length > 0 ? segmentJobs.reduce((s, j) => s + j.confidenceScore, 0) / segmentJobs.length : 0;
    const jtbd = segmentJobs.length === 0 ? 0 : this.clamp(Math.round(avgJobPriority * 0.6 + avgJobConfidence * 0.4 + (segmentJobs.length >= 2 ? 5 : 0)), 0, 100);

    const avgPainSeverity = segmentPains.length > 0 ? segmentPains.reduce((s, p) => s + p.severityScore, 0) / segmentPains.length : 0;
    const avgPainConfidence = segmentPains.length > 0 ? segmentPains.reduce((s, p) => s + p.confidenceScore, 0) / segmentPains.length : 0;
    const painCountBonus = Math.min(segmentPains.length, 3) * 5;
    const pain = segmentPains.length === 0 ? 0 : this.clamp(Math.round(avgPainSeverity * 0.5 + avgPainConfidence * 0.35 + painCountBonus), 0, 100);

    let commercial: number;
    if (!isBusinessLike) {
      commercial = 100; // never penalize individual/marketplace segments for lacking a separate buyer
    } else {
      commercial = hasBuyerClarity ? (entity?.confidenceScore ?? 70) : 40;
    }

    const useCase = segment.useCases.length === 0 ? 0 : segment.useCases.length === 1 ? 80 : 100;

    return { icp, segmentConfidence, jtbd, pain, commercial, useCase };
  }

  private assignTier(priorityScore: number, confidenceScore: number): AudiencePriorityTier {
    if (priorityScore >= this.getPrimaryMinScore() && confidenceScore >= this.getPrimaryMinConfidence()) return 'primary';
    if (priorityScore >= this.getSecondaryMinScore()) return 'secondary';
    if (priorityScore >= this.getExperimentalMinScore()) return 'experimental';
    return 'insufficient_evidence';
  }

  private buildStrengths(segment: AudienceSegment, c: ComponentScores, hasBuyerClarity: boolean, isBusinessLike: boolean, painCount: number): string[] {
    const strengths: string[] = [];
    if (c.icp >= 80) strengths.push('Strong ICP fit.');
    if (c.useCase >= 80) strengths.push(segment.useCases.length > 0 ? `Clear ${segment.useCases[0]} use case.` : 'Clear core use case.');
    if (c.segmentConfidence >= 80) strengths.push('High-confidence audience segment.');
    if (c.jtbd >= 70) strengths.push('Well-defined Jobs-to-be-Done.');
    if (isBusinessLike && hasBuyerClarity) strengths.push('Clear buyer and decision-maker evidence.');
    if (c.pain >= 60 && painCount >= 2) strengths.push('Multiple supported pain hypotheses.');
    return strengths;
  }

  private buildWeaknesses(segment: AudienceSegment, c: ComponentScores, hasBuyerClarity: boolean, isBusinessLike: boolean, painCount: number): string[] {
    const weaknesses: string[] = [];
    if (isBusinessLike && !hasBuyerClarity) weaknesses.push('Buyer evidence is limited.');
    if (isBusinessLike && segment.companySizes.length === 0) weaknesses.push('No explicit company-size targeting.');
    if (painCount > 0) weaknesses.push('Pain-point evidence is inferred rather than customer-reported.');
    if (c.jtbd < 40) weaknesses.push('Jobs-to-be-Done evidence is limited.');
    if (c.icp < 50) weaknesses.push('Segment is not a high-fit ICP candidate.');
    return weaknesses;
  }

  private buildReasons(c: ComponentScores, hasBuyerClarity: boolean): string[] {
    const reasons: string[] = [];
    if (c.icp >= 70 && c.useCase >= 70 && c.jtbd >= 60) {
      reasons.push('High ICP fit combined with strong use-case and JTBD evidence.');
    } else if (c.useCase >= 70 && c.commercial < 60) {
      reasons.push('Clear end-user use case, but commercial purchasing evidence is limited.');
    } else if (c.icp < 40 && c.jtbd < 40) {
      reasons.push('Audience evidence exists, but no strong JTBD was detected.');
    } else if (hasBuyerClarity && c.icp < 60) {
      reasons.push('Buyer/decision-maker clarity supports this audience, though ICP fit is moderate.');
    } else {
      reasons.push('Audience evidence and priority signals are mixed.');
    }
    return reasons;
  }

  private buildRationale(priorities: AudiencePriority[], primarySegmentId: string | undefined, secondarySegmentIds: string[]): string[] {
    const rationale: string[] = [];
    const primary = priorities.find((p) => p.segmentId === primarySegmentId);
    if (primary) {
      rationale.push(`${primary.segmentName} has the strongest combined ICP fit, use-case clarity, and JTBD evidence.`);
    }
    const topSecondary = priorities.find((p) => p.segmentId === secondarySegmentIds[0]);
    if (topSecondary) {
      rationale.push(`${topSecondary.segmentName} remains a strong secondary audience based on available evidence.`);
    }
    if (!primary) {
      rationale.push('No segment currently meets the evidence threshold for a primary marketing audience.');
    }
    return rationale;
  }

  private computeOverallConfidence(
    input: { signals: AudienceSignalResult; segments: AudienceSegmentResult; icp: IcpResult; buyerUserMap: BuyerUserMapResult; painPoints: AudiencePainPointResult; jtbd: AudienceJtbdResult },
    priorities: AudiencePriority[],
  ): number {
    const segmentsWithSufficientEvidence = priorities.filter((p) => p.tier === 'primary' || p.tier === 'secondary').length;
    const coverageBonus = Math.min(30, segmentsWithSufficientEvidence * 15);
    const score =
      input.segments.confidenceScore * 0.25 +
      input.icp.confidenceScore * 0.2 +
      input.jtbd.confidenceScore * 0.15 +
      input.painPoints.confidenceScore * 0.1 +
      coverageBonus;
    return this.clamp(Math.round(score), 0, 100);
  }

  private buildMissingEvidence(): string[] {
    return [
      'Market size has not been evaluated.',
      'Revenue potential is not available.',
      'Customer acquisition economics are not available.',
      'Direct customer validation is not available.',
    ];
  }

  private buildWarnings(priorities: AudiencePriority[]): string[] {
    const warnings: string[] = [
      'Audience priority is an evidence-based marketing heuristic, not a prediction of revenue or market size.',
      'Audience assumptions should be validated with real customer behavior and research.',
    ];
    if (priorities.every((p) => p.tier === 'insufficient_evidence' || p.tier === 'experimental')) {
      warnings.push('No segment currently has strong enough evidence for confident prioritization.');
    }
    return this.dedupe(warnings);
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

  private getPrimaryMinScore(): number {
    return this.getEnvNumber('AUDIENCE_PRIORITY_PRIMARY_MIN_SCORE', DEFAULT_PRIMARY_MIN_SCORE);
  }

  private getPrimaryMinConfidence(): number {
    return this.getEnvNumber('AUDIENCE_PRIORITY_PRIMARY_MIN_CONFIDENCE', DEFAULT_PRIMARY_MIN_CONFIDENCE);
  }

  private getSecondaryMinScore(): number {
    return this.getEnvNumber('AUDIENCE_PRIORITY_SECONDARY_MIN_SCORE', DEFAULT_SECONDARY_MIN_SCORE);
  }

  private getExperimentalMinScore(): number {
    return this.getEnvNumber('AUDIENCE_PRIORITY_EXPERIMENTAL_MIN_SCORE', DEFAULT_EXPERIMENTAL_MIN_SCORE);
  }

  private getMaxSegments(): number {
    return this.getEnvNumber('AUDIENCE_PRIORITY_MAX_SEGMENTS', DEFAULT_MAX_SEGMENTS);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
