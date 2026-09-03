import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AudiencePainPointService } from './audience-pain-point.service';
import { AudienceSegmentService } from './audience-segment.service';
import { AudienceSignalService } from './audience-signal.service';
import { BuyerUserMapService } from './buyer-user-map.service';
import { IcpService } from './icp.service';
import type { AudienceSegment, AudienceSegmentResult } from './types/audience-segment.types';
import type { AudienceSignalResult } from './types/audience-signal.types';
import type { AudiencePainPoint, AudiencePainPointResult } from './types/audience-pain-point.types';
import type { AudienceJob, AudienceJobType, AudienceJtbdResult } from './types/audience-jtbd.types';
import type { BuyerUserMapResult } from './types/buyer-user-map.types';
import type { IcpCandidate, IcpResult } from './types/icp.types';

const DEFAULT_MAX_PER_SEGMENT = 5;
const DEFAULT_MAX_TOTAL = 25;
const DEFAULT_MAX_STRONGEST = 8;
const DEFAULT_MAX_EVIDENCE = 10;

const CAUTION = 'Inferred JTBD hypothesis from product and audience evidence; validate with real customer research.';

interface JobTemplate {
  id: string;
  type: AudienceJobType;
  situation: string;
  motivation: string;
  desiredOutcome: string;
}

type JobSourceType = 'use_case' | 'lifecycle' | 'commercial_role' | 'coordination';

// Small, deterministic job library keyed by 10A/10B use-case labels.
const USE_CASE_JOB_LIBRARY: Record<string, JobTemplate[]> = {
  'Interview Practice': [
    { id: 'practice-realistic-interviews', type: 'functional', situation: 'preparing for interviews', motivation: 'practice realistic interview scenarios', desiredOutcome: 'improve my interview performance' },
    { id: 'feedback-improvement', type: 'learning', situation: 'practicing interviews', motivation: 'receive timely, actionable feedback that identifies weak answers', desiredOutcome: 'be better prepared for future interviews' },
  ],
  'Candidate Evaluation': [
    { id: 'evaluate-candidates-consistently', type: 'functional', situation: 'evaluating candidates', motivation: 'assess candidates consistently and efficiently', desiredOutcome: 'make better-informed hiring decisions' },
    { id: 'organize-assessment-results', type: 'administrative', situation: 'reviewing candidate assessments', motivation: 'organize and compare candidate assessment results', desiredOutcome: 'reduce manual review and comparison effort' },
  ],
  'Online Learning': [
    { id: 'learn-and-practice', type: 'functional', situation: 'working through course material', motivation: 'learn and practice course material', desiredOutcome: 'make measurable learning progress' },
  ],
  'Employee Training': [
    { id: 'deliver-consistent-training', type: 'functional', situation: 'delivering or completing training', motivation: 'deliver or complete consistent training', desiredOutcome: 'improve skills and track progress' },
  ],
  'Marketing Automation': [
    { id: 'automate-campaigns', type: 'functional', situation: 'running marketing campaigns', motivation: 'automate repetitive marketing workflows', desiredOutcome: 'run campaigns more efficiently' },
  ],
  'Lead Management': [
    { id: 'organize-lead-followup', type: 'functional', situation: 'managing leads', motivation: 'organize and follow up with leads', desiredOutcome: 'move opportunities through the sales process more effectively' },
  ],
  'Container Deployment': [
    { id: 'build-deploy-consistently', type: 'functional', situation: 'deploying applications', motivation: 'build and deploy applications consistently', desiredOutcome: 'reduce environment and configuration issues' },
  ],
  'Project Management': [
    { id: 'coordinate-tasks', type: 'functional', situation: 'coordinating tasks and project work', motivation: 'coordinate tasks and project work clearly', desiredOutcome: 'improve visibility and delivery consistency' },
  ],
};

// Used only when a segment has NO direct use case but a compatible
// lifecycle stage exists — mirrors the 10E pain-point pattern.
const LIFECYCLE_JOB_LIBRARY: Record<string, JobTemplate[]> = {
  Training: [
    { id: 'track-learner-progress', type: 'administrative', situation: 'guiding learners', motivation: 'track learner progress and provide consistent guidance', desiredOutcome: 'help learners stay on track' },
  ],
};

const BUYER_JOB: JobTemplate = {
  id: 'evaluate-value-and-adoption-fit',
  type: 'decision',
  situation: 'evaluating a solution',
  motivation: 'have clear evidence of value and adoption fit',
  desiredOutcome: 'make a confident purchase decision',
};

const ADMIN_JOB: JobTemplate = {
  id: 'manage-workflow-overhead',
  type: 'administrative',
  situation: 'managing the workflow',
  motivation: 'have simple administration and clear visibility',
  desiredOutcome: 'reduce operational overhead',
};

const COORDINATION_JOB: JobTemplate = {
  id: 'coordinate-buyer-and-user',
  type: 'coordination',
  situation: 'coordinating between administrators/buyers and end users',
  motivation: 'have a clear shared workflow',
  desiredOutcome: 'reduce handoff and communication friction',
};

@Injectable()
export class AudienceJtbdService {
  constructor(
    private readonly configService: ConfigService,
    private readonly audienceSignalService: AudienceSignalService,
    private readonly audienceSegmentService: AudienceSegmentService,
    private readonly icpService: IcpService,
    private readonly buyerUserMapService: BuyerUserMapService,
    private readonly audiencePainPointService: AudiencePainPointService,
  ) {}

  /**
   * Product-scoped orchestration. Runs 10A extraction once, then 10B–10E's
   * pure methods once each, then generate() (pure) — no website re-fetch,
   * no re-segmentation, no re-detection, no re-mapping, no re-identification.
   */
  async generateForProduct(
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
  }> {
    const signals = await this.audienceSignalService.extractForProduct(organizationId, productId, userId);
    const segments = this.audienceSegmentService.construct(signals);
    const icp = this.icpService.detect({ signals, segments });
    const buyerUserMap = this.buyerUserMapService.map({ signals, segments, icp });
    const painPoints = this.audiencePainPointService.identify({ signals, segments, icp, buyerUserMap });
    const jtbd = this.generate({ signals, segments, icp, buyerUserMap, painPoints });
    return { signals, segments, icp, buyerUserMap, painPoints, jtbd };
  }

  generate(input: {
    signals: AudienceSignalResult;
    segments: AudienceSegmentResult;
    icp: IcpResult;
    buyerUserMap: BuyerUserMapResult;
    painPoints: AudiencePainPointResult;
  }): AudienceJtbdResult {
    const { segments, icp, buyerUserMap, painPoints } = input;
    const icpBySegmentId = new Map(icp.candidates.map((c) => [c.segmentId, c]));
    const entityBySegmentId = new Map(buyerUserMap.entities.map((e) => [e.segmentId, e]));
    const relationshipSourceIds = new Set(buyerUserMap.relationships.map((r) => r.fromSegmentId));
    const painsBySegmentId = new Map<string, AudiencePainPoint[]>();
    for (const p of painPoints.painPoints) {
      if (!painsBySegmentId.has(p.segmentId)) painsBySegmentId.set(p.segmentId, []);
      painsBySegmentId.get(p.segmentId)!.push(p);
    }

    const allJobs: AudienceJob[] = [];
    const bySegment: { segmentId: string; jobIds: string[] }[] = [];

    for (const segment of segments.segments) {
      const icpCandidate = icpBySegmentId.get(segment.id);
      const commercialRoles = entityBySegmentId.get(segment.id)?.commercialRoles ?? [];
      const segmentPains = painsBySegmentId.get(segment.id) ?? [];
      const jobs = this.generateJobsForSegment(segment, icpCandidate, commercialRoles, segmentPains, relationshipSourceIds.has(segment.id), icp);
      allJobs.push(...jobs);
      bySegment.push({ segmentId: segment.id, jobIds: jobs.map((j) => j.id) });
    }

    const capped = allJobs
      .sort((a, b) => b.priorityScore - a.priorityScore || b.confidenceScore - a.confidenceScore)
      .slice(0, this.getMaxTotal());
    const cappedIds = new Set(capped.map((j) => j.id));

    const primaryJobIdBySegment: Record<string, string> = {};
    for (const segment of segments.segments) {
      const segmentJobs = capped.filter((j) => j.segmentId === segment.id);
      if (segmentJobs.length === 0) continue;
      const sorted = [...segmentJobs].sort((a, b) => b.priorityScore - a.priorityScore || b.confidenceScore - a.confidenceScore || a.id.localeCompare(b.id));
      primaryJobIdBySegment[segment.id] = sorted[0].id;
    }

    const strongestJobIds = [...capped]
      .sort((a, b) => b.priorityScore - a.priorityScore || b.confidenceScore - a.confidenceScore)
      .slice(0, this.getMaxStrongest())
      .map((j) => j.id);

    const confidenceScore = this.computeOverallConfidence(input);
    const missingEvidence = this.buildMissingEvidence(segments, capped);
    const warnings = this.buildWarnings(segments, capped);

    return {
      jobs: capped,
      bySegment: bySegment.map((b) => ({ segmentId: b.segmentId, jobIds: b.jobIds.filter((id) => cappedIds.has(id)) })),
      primaryJobIdBySegment,
      strongestJobIds,
      confidenceScore,
      missingEvidence,
      warnings,
      generatedAt: new Date(),
    };
  }

  private generateJobsForSegment(
    segment: AudienceSegment,
    icpCandidate: IcpCandidate | undefined,
    commercialRoles: string[],
    segmentPains: AudiencePainPoint[],
    isRelationshipSource: boolean,
    icp: IcpResult,
  ): AudienceJob[] {
    const jobs: AudienceJob[] = [];
    const maxPerSegment = this.getMaxPerSegment();
    const hasBuyerLike = commercialRoles.includes('buyer') || commercialRoles.includes('decision_maker') || commercialRoles.includes('economic_buyer');
    const hasAdministrator = commercialRoles.includes('administrator');

    const pushEntry = (template: JobTemplate, sourceType: JobSourceType, useCase?: string, relatedPains: AudiencePainPoint[] = []) => {
      if (jobs.length >= maxPerSegment) return;
      const id = `${segment.id}::${template.id}`;
      if (jobs.some((j) => j.id === id)) return;
      jobs.push(this.buildJob(segment, template, id, sourceType, icpCandidate, commercialRoles, relatedPains, icp, useCase));
    };

    const painsForUseCase = (useCase: string) => segmentPains.filter((p) => p.relatedUseCases.includes(useCase));
    const painsForCategory = (categories: string[]) => segmentPains.filter((p) => categories.includes(p.category));

    // 1. Use-case-derived jobs (primary anchor).
    for (const useCase of segment.useCases) {
      for (const template of USE_CASE_JOB_LIBRARY[useCase] ?? []) {
        pushEntry(template, 'use_case', useCase, painsForUseCase(useCase));
      }
    }

    // 2. Lifecycle-derived jobs — only when NO direct use case exists at all.
    if (segment.useCases.length === 0) {
      for (const lifecycle of segment.lifecycleStages) {
        for (const template of LIFECYCLE_JOB_LIBRARY[lifecycle] ?? []) {
          pushEntry(template, 'lifecycle', undefined, painsForCategory(['visibility', 'consistency']));
        }
      }
    }

    // 3. Coordination job — ordered before generic buyer/admin jobs so it is
    // never crowded out by them when the per-segment cap is tight.
    if (isRelationshipSource && painsForCategory(['coordination']).length > 0) {
      pushEntry(COORDINATION_JOB, 'coordination', undefined, painsForCategory(['coordination']));
    }

    // 4. Buyer/decision job — only with commercial-role + buyer-context pain evidence.
    const buyerPains = painsForCategory(['decision_making', 'cost']);
    if (hasBuyerLike && buyerPains.length > 0) {
      const noOtherEvidence = segment.useCases.length === 0 && segment.lifecycleStages.length === 0 && jobs.length === 0;
      pushEntry(BUYER_JOB, 'commercial_role', undefined, buyerPains);
      if (noOtherEvidence) return jobs; // no use case/lifecycle at all: cap to this one generic job
    }

    // 5. Administrative job — only with administrator role + admin pain evidence.
    const adminPains = painsForCategory(['administration']);
    if (hasAdministrator && adminPains.length > 0) {
      if (segment.useCases.length === 0 && segment.lifecycleStages.length === 0 && jobs.length === 0) {
        pushEntry(ADMIN_JOB, 'commercial_role', undefined, adminPains);
        return jobs;
      }
      pushEntry(ADMIN_JOB, 'commercial_role', undefined, adminPains);
    }

    return jobs;
  }

  private buildJob(
    segment: AudienceSegment,
    template: JobTemplate,
    id: string,
    sourceType: JobSourceType,
    icpCandidate: IcpCandidate | undefined,
    commercialRoles: string[],
    relatedPains: AudiencePainPoint[],
    icp: IcpResult,
    useCase?: string,
  ): AudienceJob {
    const isPrimaryIcp = !!icpCandidate && icp.primaryIcpId === icpCandidate.id;

    let priorityBase = 45;
    if (sourceType === 'use_case') priorityBase = 70;
    else if (sourceType === 'lifecycle') priorityBase = 55;
    else if (sourceType === 'commercial_role') priorityBase = 50;
    const priorityScore = this.clamp(
      Math.round(priorityBase + (relatedPains.length > 0 ? 15 : 0) + (isPrimaryIcp ? 10 : 0)),
      0,
      100,
    );

    let confidenceScore = segment.confidenceScore * 0.4 + Math.min(10, segment.sourceSignals.length * 2);
    if (icpCandidate) confidenceScore += (icpCandidate.fitScore / 100) * 15;
    if (relatedPains.length > 0) {
      const avgPainConfidence = relatedPains.reduce((s, p) => s + p.confidenceScore, 0) / relatedPains.length;
      confidenceScore += (avgPainConfidence / 100) * 20;
    }
    if (sourceType === 'use_case') confidenceScore += 15;
    else if (sourceType === 'lifecycle') confidenceScore += 8;
    else if (sourceType === 'commercial_role') confidenceScore += 8;
    else if (sourceType === 'coordination') confidenceScore += 5;

    const reasons: string[] = [];
    if (useCase) reasons.push(`Anchored on the detected "${useCase}" use case.`);
    if (sourceType === 'lifecycle') reasons.push('Anchored on a detected lifecycle stage in the absence of a direct use case.');
    if (sourceType === 'commercial_role') reasons.push('Anchored on detected buyer/administrative evidence for this segment.');
    if (sourceType === 'coordination') reasons.push('Anchored on a detected buyer/administrator-to-end-user relationship and coordination pain point.');
    if (relatedPains.length > 0) reasons.push(`Refined by related pain point(s): ${relatedPains.map((p) => p.title).join(', ')}.`);
    if (isPrimaryIcp) reasons.push('This segment is the best-supported ICP candidate.');

    const statement = this.capitalize(`when ${template.situation}, I want to ${template.motivation} so I can ${template.desiredOutcome}.`);

    return {
      id,
      segmentId: segment.id,
      segmentName: segment.name,
      type: template.type,
      situation: template.situation,
      motivation: template.motivation,
      desiredOutcome: template.desiredOutcome,
      statement,
      priorityScore,
      confidenceScore: this.clamp(Math.round(confidenceScore), 0, 100),
      relatedUseCases: useCase ? [useCase] : [],
      relatedPainPointIds: relatedPains.map((p) => p.id),
      relatedCommercialRoles: commercialRoles,
      evidence: this.dedupe([...segment.evidence, ...relatedPains.flatMap((p) => p.evidence)]).slice(0, this.getMaxEvidence()),
      reasons,
      caution: CAUTION,
    };
  }

  private computeOverallConfidence(input: {
    signals: AudienceSignalResult;
    segments: AudienceSegmentResult;
    icp: IcpResult;
    buyerUserMap: BuyerUserMapResult;
    painPoints: AudiencePainPointResult;
  }): number {
    const segmentsWithUseCase = input.segments.segments.filter((s) => s.useCases.length > 0).length;
    const useCaseCoverage = input.segments.segments.length > 0 ? segmentsWithUseCase / input.segments.segments.length : 0;
    const score =
      input.signals.confidenceScore * 0.1 +
      input.segments.confidenceScore * 0.2 +
      input.icp.confidenceScore * 0.15 +
      input.buyerUserMap.confidenceScore * 0.1 +
      input.painPoints.confidenceScore * 0.15 +
      useCaseCoverage * 100 * 0.3;
    return this.clamp(Math.round(score), 0, 100);
  }

  private buildMissingEvidence(segments: AudienceSegmentResult, jobs: AudienceJob[]): string[] {
    const missing: string[] = ['Direct customer-stated jobs-to-be-done are not available.'];
    if (segments.segments.some((s) => s.useCases.length === 0)) {
      missing.push('No explicit use case exists for some audience segments.');
    }
    if (jobs.some((j) => j.type !== 'functional' && j.relatedPainPointIds.length === 0)) {
      missing.push('Some jobs rely on inferred product workflow evidence.');
    }
    return missing;
  }

  private buildWarnings(segments: AudienceSegmentResult, jobs: AudienceJob[]): string[] {
    const warnings: string[] = ['Jobs-to-be-Done are inferred hypotheses from product and audience evidence and should be validated with customer research.'];
    const segmentIdsWithJobs = new Set(jobs.map((j) => j.segmentId));
    if (segments.segments.some((s) => !segmentIdsWithJobs.has(s.id))) {
      warnings.push('Some audience segments have limited job evidence.');
    }
    if (jobs.some((j) => j.type === 'decision')) warnings.push('Buyer JTBD evidence is limited.');
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

  private capitalize(value: string): string {
    return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private getMaxPerSegment(): number {
    return this.getEnvNumber('AUDIENCE_JTBD_MAX_PER_SEGMENT', DEFAULT_MAX_PER_SEGMENT);
  }

  private getMaxTotal(): number {
    return this.getEnvNumber('AUDIENCE_JTBD_MAX_TOTAL', DEFAULT_MAX_TOTAL);
  }

  private getMaxStrongest(): number {
    return this.getEnvNumber('AUDIENCE_JTBD_MAX_STRONGEST', DEFAULT_MAX_STRONGEST);
  }

  private getMaxEvidence(): number {
    return this.getEnvNumber('AUDIENCE_JTBD_MAX_EVIDENCE', DEFAULT_MAX_EVIDENCE);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
