import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AudienceSegmentService } from './audience-segment.service';
import { AudienceSignalService } from './audience-signal.service';
import { BuyerUserMapService } from './buyer-user-map.service';
import { IcpService } from './icp.service';
import type { AudienceSegment, AudienceSegmentResult } from './types/audience-segment.types';
import type { AudienceSignalResult } from './types/audience-signal.types';
import type { AudiencePainPoint, AudiencePainPointResult, PainPointCategory } from './types/audience-pain-point.types';
import type { BuyerUserMapResult } from './types/buyer-user-map.types';
import type { IcpCandidate, IcpResult } from './types/icp.types';

const DEFAULT_MAX_PER_SEGMENT = 6;
const DEFAULT_MAX_TOTAL = 30;
const DEFAULT_MAX_STRONGEST = 8;

const CAUTION = 'Inferred from product and audience evidence; validate with real customer research.';

interface PainLibraryEntry {
  id: string;
  title: string;
  category: PainPointCategory;
  description: string;
}

type PainSourceType = 'use_case' | 'lifecycle' | 'commercial_role' | 'coordination';

// Small, deterministic pain library keyed by 10A/10B use-case labels.
const USE_CASE_PAIN_LIBRARY: Record<string, PainLibraryEntry[]> = {
  'Interview Practice': [
    { id: 'limited-practice-opportunities', title: 'Limited opportunities for realistic interview practice', category: 'learning', description: 'This workflow could involve limited access to realistic, varied practice scenarios.' },
    { id: 'delayed-feedback', title: 'Difficulty receiving timely feedback', category: 'learning', description: 'This segment may experience delays between a practice attempt and useful feedback.' },
    { id: 'identifying-weak-answers', title: 'Difficulty identifying weak answers', category: 'quality', description: 'Without structured evaluation support, identifying weak or unclear answers may be difficult.' },
    { id: 'tracking-improvement', title: 'Difficulty tracking improvement over time', category: 'visibility', description: 'This segment may lack visibility into progress across multiple practice attempts.' },
  ],
  'Candidate Evaluation': [
    { id: 'manual-slow-evaluation', title: 'Manual or slow candidate evaluation', category: 'efficiency', description: 'Evaluation appears relevant to this segment based on detected use cases and may involve manual effort.' },
    { id: 'inconsistent-evaluation', title: 'Inconsistent evaluation between interviewers', category: 'consistency', description: 'Multiple evaluators may apply criteria inconsistently without structured evaluation support.' },
    { id: 'difficulty-comparing-candidates', title: 'Difficulty comparing candidate performance', category: 'visibility', description: 'Comparing candidates across interviews may be difficult without consolidated reporting.' },
    { id: 'limited-reporting', title: 'Limited reporting/visibility', category: 'visibility', description: 'This workflow could involve limited visibility into evaluation outcomes.' },
  ],
  'Employee Training': [
    { id: 'progress-tracking', title: 'Difficulty tracking learner progress', category: 'visibility', description: 'This segment may lack visibility into individual or group training progress.' },
    { id: 'training-feedback', title: 'Limited feedback during training', category: 'learning', description: 'This workflow could involve limited feedback loops during training activities.' },
    { id: 'training-consistency', title: 'Inconsistent training experience', category: 'consistency', description: 'Training experience may vary without a consistent structured approach.' },
  ],
  'Online Learning': [
    { id: 'progress-tracking', title: 'Difficulty tracking learner progress', category: 'visibility', description: 'This segment may lack visibility into learner progress across content.' },
    { id: 'learning-feedback', title: 'Limited feedback for learners', category: 'learning', description: 'This workflow could involve limited feedback on learner performance.' },
    { id: 'learning-consistency', title: 'Inconsistent learning experience across users', category: 'consistency', description: 'Learning experience may vary without a consistent structured approach.' },
  ],
  'Marketing Automation': [
    { id: 'manual-campaign-work', title: 'Repetitive manual campaign work', category: 'efficiency', description: 'This workflow could involve repetitive manual effort in running campaigns.' },
    { id: 'lead-workflow-difficulty', title: 'Difficulty managing leads/workflows', category: 'workflow', description: 'Managing leads through the funnel may involve workflow friction.' },
    { id: 'marketing-visibility', title: 'Limited performance visibility', category: 'visibility', description: 'This segment may lack visibility into campaign performance.' },
  ],
  'Lead Management': [
    { id: 'lead-workflow-difficulty', title: 'Difficulty managing leads/workflows', category: 'workflow', description: 'Managing leads through the funnel may involve workflow friction.' },
    { id: 'lead-followup-consistency', title: 'Inconsistent lead follow-up', category: 'consistency', description: 'Follow-up on leads may be inconsistent without structured workflow support.' },
  ],
  'Container Deployment': [
    { id: 'deployment-complexity', title: 'Deployment complexity', category: 'workflow', description: 'This workflow could involve non-trivial deployment complexity.' },
    { id: 'environment-inconsistency', title: 'Environment inconsistency', category: 'consistency', description: 'Differences between environments may introduce inconsistency.' },
    { id: 'setup-overhead', title: 'Setup/configuration overhead', category: 'adoption', description: 'Initial setup and configuration may involve meaningful overhead.' },
  ],
  'Project Management': [
    { id: 'task-visibility', title: 'Poor task visibility', category: 'visibility', description: 'This segment may lack clear visibility into task status.' },
    { id: 'coordination-overhead', title: 'Coordination overhead', category: 'coordination', description: 'Coordinating work across people/teams may involve overhead.' },
    { id: 'workflow-fragmentation', title: 'Missed deadlines/workflow fragmentation', category: 'workflow', description: 'Fragmented workflows may contribute to missed deadlines.' },
  ],
};

// Used only when a segment has NO direct use case but a compatible lifecycle
// stage exists — keeps the taxonomy small by reusing conceptually similar
// entries rather than duplicating a whole parallel library.
const LIFECYCLE_PAIN_LIBRARY: Record<string, PainLibraryEntry[]> = {
  Training: [
    { id: 'progress-tracking', title: 'Difficulty tracking progress', category: 'visibility', description: 'This segment may lack visibility into training/learning progress.' },
    { id: 'training-consistency', title: 'Inconsistent training experience', category: 'consistency', description: 'Training experience may vary without a consistent structured approach.' },
  ],
};

const BUYER_VALUE_PAIN: PainLibraryEntry = {
  id: 'value-justification',
  title: 'Difficulty proving value to stakeholders',
  category: 'decision_making',
  description: 'Buyer-side stakeholders may need to justify adoption or cost even without a specific detected use case.',
};

const ADMIN_OVERHEAD_PAIN: PainLibraryEntry = {
  id: 'admin-overhead',
  title: 'Administrative overhead',
  category: 'administration',
  description: 'This segment may carry administrative overhead related to managing the product for others.',
};

const COORDINATION_PAIN: PainLibraryEntry = {
  id: 'buyer-user-coordination',
  title: 'Potential coordination friction between purchasing/admin stakeholders and end users',
  category: 'coordination',
  description: 'Potential coordination between purchasing/admin stakeholders and end users.',
};

@Injectable()
export class AudiencePainPointService {
  constructor(
    private readonly configService: ConfigService,
    private readonly audienceSignalService: AudienceSignalService,
    private readonly audienceSegmentService: AudienceSegmentService,
    private readonly icpService: IcpService,
    private readonly buyerUserMapService: BuyerUserMapService,
  ) {}

  /**
   * Product-scoped orchestration. Runs 10A extraction and 10B/10C/10D's
   * pure methods exactly once each, then identify() (pure) — no website
   * re-fetch, no re-segmentation, no re-detection, no re-mapping.
   */
  async identifyForProduct(
    organizationId: string,
    productId: string,
    userId: string,
  ): Promise<{ signals: AudienceSignalResult; segments: AudienceSegmentResult; icp: IcpResult; buyerUserMap: BuyerUserMapResult; painPoints: AudiencePainPointResult }> {
    const signals = await this.audienceSignalService.extractForProduct(organizationId, productId, userId);
    const segments = this.audienceSegmentService.construct(signals);
    const icp = this.icpService.detect({ signals, segments });
    const buyerUserMap = this.buyerUserMapService.map({ signals, segments, icp });
    const painPoints = this.identify({ signals, segments, icp, buyerUserMap });
    return { signals, segments, icp, buyerUserMap, painPoints };
  }

  identify(input: { signals: AudienceSignalResult; segments: AudienceSegmentResult; icp: IcpResult; buyerUserMap: BuyerUserMapResult }): AudiencePainPointResult {
    const { segments, icp, buyerUserMap } = input;
    const icpBySegmentId = new Map(icp.candidates.map((c) => [c.segmentId, c]));
    const entityBySegmentId = new Map(buyerUserMap.entities.map((e) => [e.segmentId, e]));
    const relationshipSourceIds = new Set(buyerUserMap.relationships.map((r) => r.fromSegmentId));

    const allPainPoints: AudiencePainPoint[] = [];
    const bySegment: { segmentId: string; painPointIds: string[] }[] = [];

    for (const segment of segments.segments) {
      const icpCandidate = icpBySegmentId.get(segment.id);
      const commercialRoles = entityBySegmentId.get(segment.id)?.commercialRoles ?? [];
      const pains = this.generatePainsForSegment(segment, icpCandidate, commercialRoles, relationshipSourceIds.has(segment.id), buyerUserMap, icp);
      allPainPoints.push(...pains);
      bySegment.push({ segmentId: segment.id, painPointIds: pains.map((p) => p.id) });
    }

    const capped = allPainPoints
      .sort((a, b) => b.severityScore - a.severityScore || b.confidenceScore - a.confidenceScore)
      .slice(0, this.getMaxTotal());

    const strongestPainPointIds = [...capped]
      .sort((a, b) => b.severityScore - a.severityScore || b.confidenceScore - a.confidenceScore)
      .slice(0, this.getMaxStrongest())
      .map((p) => p.id);

    const confidenceScore = this.computeOverallConfidence(input, segments);
    const missingEvidence = this.buildMissingEvidence(segments, capped, buyerUserMap);
    const warnings = this.buildWarnings(capped);

    return {
      painPoints: capped,
      bySegment: bySegment.map((b) => ({ segmentId: b.segmentId, painPointIds: b.painPointIds.filter((id) => capped.some((p) => p.id === id)) })),
      strongestPainPointIds,
      confidenceScore,
      missingEvidence,
      warnings,
      generatedAt: new Date(),
    };
  }

  private generatePainsForSegment(
    segment: AudienceSegment,
    icpCandidate: IcpCandidate | undefined,
    commercialRoles: string[],
    isRelationshipSource: boolean,
    buyerUserMap: BuyerUserMapResult,
    icp: IcpResult,
  ): AudiencePainPoint[] {
    const pains: AudiencePainPoint[] = [];
    const maxPerSegment = this.getMaxPerSegment();
    const hasBuyerOrDecision = commercialRoles.includes('buyer') || commercialRoles.includes('decision_maker');
    const hasAdministrator = commercialRoles.includes('administrator');

    const pushEntry = (entry: PainLibraryEntry, sourceType: PainSourceType, useCase?: string) => {
      if (pains.length >= maxPerSegment) return;
      if (pains.some((p) => p.id === `${segment.id}::${entry.id}`)) return; // dedupe within segment
      pains.push(this.buildPainPoint(segment, entry, sourceType, icpCandidate, commercialRoles, buyerUserMap, icp, useCase));
    };

    // 1. Use-case-derived pains (primary anchor).
    for (const useCase of segment.useCases) {
      for (const entry of USE_CASE_PAIN_LIBRARY[useCase] ?? []) {
        pushEntry(entry, 'use_case', useCase);
      }
    }

    // 2. Lifecycle-derived pains — only when NO direct use case exists at all.
    if (segment.useCases.length === 0) {
      for (const lifecycle of segment.lifecycleStages) {
        for (const entry of LIFECYCLE_PAIN_LIBRARY[lifecycle] ?? []) {
          pushEntry(entry, 'lifecycle');
        }
      }
    }

    // 3. Coordination pain — only on the buyer/admin side of a real relationship.
    // Ordered before the generic buyer-context pains below so a real,
    // specific relationship signal is never crowded out by a generic one
    // when the per-segment cap is tight.
    if (isRelationshipSource) {
      pushEntry(COORDINATION_PAIN, 'coordination');
    }

    // 4. Buyer/decision-maker context pains — only with explicit commercial + business context.
    const hasCommercialContext = segment.businessModelSignals.length > 0 || segment.buyerSignals.length > 0;
    if (hasBuyerOrDecision && hasCommercialContext) {
      if (segment.useCases.length === 0 && segment.lifecycleStages.length === 0 && pains.length === 0) {
        // No direct use-case/lifecycle evidence at all: at most ONE generic pain.
        pushEntry(hasAdministrator ? ADMIN_OVERHEAD_PAIN : BUYER_VALUE_PAIN, 'commercial_role');
      } else {
        pushEntry(BUYER_VALUE_PAIN, 'commercial_role');
        if (hasAdministrator) pushEntry(ADMIN_OVERHEAD_PAIN, 'commercial_role');
      }
    }

    return pains;
  }

  private buildPainPoint(
    segment: AudienceSegment,
    entry: PainLibraryEntry,
    sourceType: PainSourceType,
    icpCandidate: IcpCandidate | undefined,
    commercialRoles: string[],
    buyerUserMap: BuyerUserMapResult,
    icp: IcpResult,
    useCase?: string,
  ): AudiencePainPoint {
    const isPrimaryIcp = !!icpCandidate && icp.primaryIcpId === icpCandidate.id;
    const isPrimaryUserOrBuyer = segment.id === buyerUserMap.primaryUserSegmentId || segment.id === buyerUserMap.primaryBuyerSegmentId;

    let severityBase = 45;
    if (sourceType === 'use_case') severityBase = 65;
    else if (sourceType === 'lifecycle') severityBase = 55;
    else if (sourceType === 'commercial_role') severityBase = 50;
    const severityScore = this.clamp(
      Math.round(severityBase + (isPrimaryIcp ? 15 : 0) + (isPrimaryUserOrBuyer ? 10 : 0)),
      0,
      100,
    );

    let confidenceScore = segment.confidenceScore * 0.5 + Math.min(15, segment.sourceSignals.length * 2.5);
    if (icpCandidate) confidenceScore += (icpCandidate.fitScore / 100) * 15;
    if (sourceType === 'use_case') confidenceScore += 15;
    else if (sourceType === 'lifecycle') confidenceScore += 8;
    else if (sourceType === 'commercial_role') confidenceScore += segment.buyerSignals.length > 0 ? 10 : 3;
    else if (sourceType === 'coordination') confidenceScore += 8;

    const reasons: string[] = [];
    if (useCase) reasons.push(`This appears relevant to the segment based on the detected "${useCase}" use case.`);
    if (sourceType === 'lifecycle') reasons.push('This appears relevant based on a detected lifecycle stage in the absence of a direct use case.');
    if (sourceType === 'commercial_role') reasons.push('This appears relevant based on detected buyer/administrative evidence for this segment.');
    if (sourceType === 'coordination') reasons.push('This segment shows buyer/administrator evidence connected to a separate end-user segment.');
    if (isPrimaryIcp) reasons.push('This segment is the best-supported ICP candidate.');

    return {
      id: `${segment.id}::${entry.id}`,
      segmentId: segment.id,
      segmentName: segment.name,
      title: entry.title,
      category: entry.category,
      description: entry.description,
      severityScore,
      confidenceScore: this.clamp(Math.round(confidenceScore), 0, 100),
      evidence: segment.evidence.slice(0, 5),
      reasons,
      relatedUseCases: useCase ? [useCase] : [],
      relatedLifecycleStages: sourceType === 'lifecycle' ? segment.lifecycleStages : [],
      relatedCommercialRoles: commercialRoles,
      caution: CAUTION,
    };
  }

  private computeOverallConfidence(
    input: { signals: AudienceSignalResult; segments: AudienceSegmentResult; icp: IcpResult; buyerUserMap: BuyerUserMapResult },
    segments: AudienceSegmentResult,
  ): number {
    const segmentsWithUseCase = segments.segments.filter((s) => s.useCases.length > 0).length;
    const useCaseCoverage = segments.segments.length > 0 ? segmentsWithUseCase / segments.segments.length : 0;
    const score =
      input.signals.confidenceScore * 0.15 +
      input.segments.confidenceScore * 0.25 +
      input.icp.confidenceScore * 0.2 +
      input.buyerUserMap.confidenceScore * 0.15 +
      useCaseCoverage * 100 * 0.25;
    return this.clamp(Math.round(score), 0, 100);
  }

  private buildMissingEvidence(segments: AudienceSegmentResult, painPoints: AudiencePainPoint[], buyerUserMap: BuyerUserMapResult): string[] {
    const missing: string[] = ['Direct customer-reported pain-point evidence is not available.'];
    if (segments.segments.some((s) => s.useCases.length === 0)) {
      missing.push('No explicit use-case evidence exists for some segments.');
    }
    const hasBuyerEntities = buyerUserMap.buyerSegmentIds.length > 0 || buyerUserMap.decisionMakerSegmentIds.length > 0;
    const hasBuyerPain = painPoints.some((p) => p.category === 'decision_making' || p.category === 'cost' || p.category === 'administration');
    if (hasBuyerEntities && !hasBuyerPain) missing.push('Buyer-specific pain evidence is limited.');
    const segmentsWithNoPains = segments.segments.filter((s) => !painPoints.some((p) => p.segmentId === s.id)).length;
    if (segmentsWithNoPains > 0) missing.push('Some segments have insufficient evidence for pain-point inference.');
    return missing;
  }

  private buildWarnings(painPoints: AudiencePainPoint[]): string[] {
    const warnings: string[] = ['Pain points are inferred hypotheses from product and audience evidence and should be validated with customer research.'];
    if (painPoints.some((p) => p.confidenceScore < 50)) warnings.push('Pain-point confidence is limited for some segments.');
    if (painPoints.some((p) => p.category === 'decision_making' || p.category === 'coordination' || p.category === 'administration')) {
      warnings.push('Buyer-specific pain points are based on indirect evidence.');
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

  private getMaxPerSegment(): number {
    return this.getEnvNumber('AUDIENCE_PAIN_MAX_PER_SEGMENT', DEFAULT_MAX_PER_SEGMENT);
  }

  private getMaxTotal(): number {
    return this.getEnvNumber('AUDIENCE_PAIN_MAX_TOTAL', DEFAULT_MAX_TOTAL);
  }

  private getMaxStrongest(): number {
    return this.getEnvNumber('AUDIENCE_PAIN_MAX_STRONGEST', DEFAULT_MAX_STRONGEST);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
