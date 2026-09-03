import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AudienceSignal, AudienceSignalCategory, AudienceSignalResult } from './types/audience-signal.types';
import type { AudienceSegment, AudienceSegmentResult, AudienceSegmentType } from './types/audience-segment.types';

const DEFAULT_MAX_SEGMENTS = 8;
const DEFAULT_MAX_EVIDENCE = 10;

// Below this, an anchor is too weak to found a segment on regardless of support.
const MIN_SUPPORTED_ANCHOR_CONFIDENCE = 35;
// At/above this, an anchor may stand alone with zero supporting signals.
const MIN_STANDALONE_CONFIDENCE = 60;

interface AnchorFamily {
  key: string;
  labels: string[];
  segmentType: AudienceSegmentType;
  defaultName: string;
}

// Compatible role families — deliberately small. Roles NOT listed here
// (e.g. the generic "Managers") never anchor a segment on their own.
const ROLE_FAMILIES: AnchorFamily[] = [
  { key: 'candidates', labels: ['Candidates'], segmentType: 'individual', defaultName: 'Candidates' },
  { key: 'hiring_team', labels: ['Recruiters', 'Hiring Managers', 'HR Teams'], segmentType: 'team', defaultName: 'HR and hiring teams' },
  { key: 'students', labels: ['Students'], segmentType: 'individual', defaultName: 'Students' },
  { key: 'educators', labels: ['Teachers'], segmentType: 'individual', defaultName: 'Teachers' },
  { key: 'developers', labels: ['Developers'], segmentType: 'individual', defaultName: 'Developers' },
  { key: 'sales_team', labels: ['Sales Representatives', 'Sales Managers'], segmentType: 'team', defaultName: 'Sales teams' },
  { key: 'marketers', labels: ['Marketers'], segmentType: 'team', defaultName: 'Marketers' },
  { key: 'founders', labels: ['Founders', 'Business Owners'], segmentType: 'business', defaultName: 'Founders and business owners' },
  { key: 'administrators', labels: ['Administrators'], segmentType: 'team', defaultName: 'Administrators' },
  { key: 'support_agents', labels: ['Support Agents'], segmentType: 'team', defaultName: 'Support agents' },
  { key: 'finance_team', labels: ['Finance Teams'], segmentType: 'team', defaultName: 'Finance teams' },
  { key: 'operations_team', labels: ['Operations Teams'], segmentType: 'team', defaultName: 'Operations teams' },
  { key: 'healthcare_professionals', labels: ['Healthcare Professionals'], segmentType: 'individual', defaultName: 'Healthcare professionals' },
  { key: 'analysts', labels: ['Analysts'], segmentType: 'individual', defaultName: 'Analysts' },
  { key: 'designers', labels: ['Designers'], segmentType: 'individual', defaultName: 'Designers' },
];

// Used ONLY when no role signal is present at all in the result.
const USER_TYPE_FAMILIES: AnchorFamily[] = [
  { key: 'marketplace_seller_side', labels: ['Marketplace Seller'], segmentType: 'marketplace_side', defaultName: 'Marketplace sellers' },
  { key: 'marketplace_buyer_side', labels: ['Marketplace Buyer', 'Consumer'], segmentType: 'marketplace_side', defaultName: 'Marketplace buyers' },
  { key: 'enterprise', labels: ['Enterprise'], segmentType: 'business', defaultName: 'Enterprise teams' },
  { key: 'agency', labels: ['Agency'], segmentType: 'business', defaultName: 'Agencies' },
  { key: 'institution', labels: ['School / Institution'], segmentType: 'institution', defaultName: 'Schools and institutions' },
  { key: 'individual_user', labels: ['Individual User'], segmentType: 'individual', defaultName: 'Individual users' },
];

// Each use case is assigned only to the present anchor(s) with the highest
// compatibility weight — prevents e.g. "Candidate Evaluation" muddying both
// a candidate-side AND a hiring-side segment when both are present.
const USE_CASE_COMPATIBILITY: Record<string, { family: string; weight: number }[]> = {
  'Interview Practice': [{ family: 'candidates', weight: 1.0 }],
  'Candidate Evaluation': [
    { family: 'hiring_team', weight: 1.0 },
    { family: 'candidates', weight: 0.5 },
  ],
  'Employee Training': [
    { family: 'hiring_team', weight: 0.6 },
    { family: 'administrators', weight: 0.6 },
  ],
  'Online Learning': [
    { family: 'students', weight: 1.0 },
    { family: 'educators', weight: 0.8 },
  ],
  'Marketing Automation': [{ family: 'marketers', weight: 1.0 }],
  'Lead Management': [
    { family: 'sales_team', weight: 1.0 },
    { family: 'marketers', weight: 0.6 },
  ],
  'Container Deployment': [{ family: 'developers', weight: 1.0 }],
  'Project Management': [
    { family: 'administrators', weight: 0.6 },
    { family: 'developers', weight: 0.5 },
  ],
};

// Non-exclusive: a lifecycle stage may support multiple present anchors.
// Empty list = generic, attaches to every present anchor.
const LIFECYCLE_COMPATIBILITY: Record<string, string[]> = {
  Practice: ['candidates', 'students'],
  Evaluation: ['candidates', 'hiring_team'],
  Training: ['students', 'educators', 'hiring_team', 'administrators'],
  Onboarding: ['administrators'],
  Purchase: ['founders', 'administrators'],
  Implementation: ['administrators', 'developers'],
  'Daily Usage': [],
  Reporting: ['hiring_team', 'administrators'],
  Optimization: ['administrators'],
  Support: ['support_agents'],
  Awareness: [],
};

const NAME_TEMPLATES: Record<string, string> = {
  'candidates::Interview Practice': 'Candidates preparing for interviews',
  'hiring_team::Candidate Evaluation': 'HR and hiring teams evaluating candidates',
  'students::Online Learning': 'Students using online learning',
  'educators::Online Learning': 'Teachers using online learning',
  'developers::Container Deployment': 'Developers deploying containerized applications',
  'marketers::Marketing Automation': 'Marketers automating campaigns',
  'sales_team::Lead Management': 'Sales teams managing leads',
  'administrators::Project Management': 'Administrators managing projects',
};

interface AnchorContext {
  family: AnchorFamily;
  anchorAxis: 'role' | 'user_type';
  anchorSignals: AudienceSignal[];
}

@Injectable()
export class AudienceSegmentService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Pure grouping over an already-computed AudienceSignalResult (Sprint
   * 10A). Never fetches product/website/category data.
   */
  construct(signalResult: AudienceSignalResult): AudienceSegmentResult {
    const byCategory = this.groupByCategory(signalResult.signals);
    const roleByLabel = new Map((byCategory.role ?? []).map((s) => [s.label, s]));
    const userTypeByLabel = new Map((byCategory.user_type ?? []).map((s) => [s.label, s]));

    const presentRoleFamilies = ROLE_FAMILIES.filter((f) => f.labels.some((l) => roleByLabel.has(l)));
    const useUserTypeAnchors = presentRoleFamilies.length === 0;
    const presentUserTypeFamilies = useUserTypeAnchors
      ? USER_TYPE_FAMILIES.filter((f) => f.labels.some((l) => userTypeByLabel.has(l)))
      : [];

    const anchors: AnchorContext[] = presentRoleFamilies.length > 0
      ? presentRoleFamilies.map((family) => ({
          family,
          anchorAxis: 'role' as const,
          anchorSignals: family.labels.filter((l) => roleByLabel.has(l)).map((l) => roleByLabel.get(l)!),
        }))
      : presentUserTypeFamilies.map((family) => ({
          family,
          anchorAxis: 'user_type' as const,
          anchorSignals: family.labels.filter((l) => userTypeByLabel.has(l)).map((l) => userTypeByLabel.get(l)!),
        }));

    const presentFamilyKeys = new Set(anchors.map((a) => a.family.key));
    const useCaseAssignment = this.assignUseCases(byCategory.use_case ?? [], presentFamilyKeys);

    const usedLabels = new Set<string>();
    const segments: AudienceSegment[] = [];

    for (const anchor of anchors) {
      const built = this.buildSegment(anchor, byCategory, useCaseAssignment.get(anchor.family.key) ?? []);
      if (!built) continue;
      built.usedLabels.forEach((l) => usedLabels.add(l));
      segments.push(built.segment);
    }

    const rankedSegments = segments
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .slice(0, this.getMaxSegments());

    const primarySegmentId = rankedSegments[0]?.id;

    const ungroupedSignals = this.dedupe(
      signalResult.signals.filter((s) => !usedLabels.has(s.label)).map((s) => s.label),
    );

    const confidenceScore = this.computeOverallConfidence(signalResult, rankedSegments, ungroupedSignals);
    const warnings = this.buildWarnings(signalResult, rankedSegments, ungroupedSignals);

    return {
      segments: rankedSegments,
      primarySegmentId,
      confidenceScore,
      ungroupedSignals,
      warnings,
      generatedAt: new Date(),
    };
  }

  private assignUseCases(useCaseSignals: AudienceSignal[], presentFamilyKeys: Set<string>): Map<string, AudienceSignal[]> {
    const assignment = new Map<string, AudienceSignal[]>();
    for (const signal of useCaseSignals) {
      const entries = (USE_CASE_COMPATIBILITY[signal.label] ?? []).filter((e) => presentFamilyKeys.has(e.family));
      if (entries.length === 0) continue;
      const maxWeight = Math.max(...entries.map((e) => e.weight));
      for (const entry of entries.filter((e) => e.weight === maxWeight)) {
        if (!assignment.has(entry.family)) assignment.set(entry.family, []);
        assignment.get(entry.family)!.push(signal);
      }
    }
    return assignment;
  }

  private buildSegment(
    anchor: AnchorContext,
    byCategory: Partial<Record<AudienceSignalCategory, AudienceSignal[]>>,
    useCaseMatches: AudienceSignal[],
  ): { segment: AudienceSegment; usedLabels: Set<string> } | null {
    const { family, anchorAxis, anchorSignals } = anchor;
    const anchorConfidence = Math.max(...anchorSignals.map((s) => s.confidenceScore));

    const lifecycleMatches = (byCategory.lifecycle ?? []).filter((s) => {
      const compatible = LIFECYCLE_COMPATIBILITY[s.label];
      return compatible === undefined || compatible.length === 0 || compatible.includes(family.key);
    });

    const industrySignals = byCategory.industry ?? [];

    const nonIndividual = family.segmentType !== 'individual';
    const companyTypeSignals = nonIndividual ? byCategory.company_type ?? [] : [];
    const companySizeSignals = nonIndividual ? byCategory.company_size ?? [] : [];

    const buyerEligible = family.segmentType === 'team' || family.segmentType === 'business' || family.segmentType === 'institution';
    const buyerSignalsMatched = buyerEligible ? byCategory.buyer ?? [] : [];

    const businessModelMatched = (byCategory.business_model ?? []).filter((s) => {
      if (s.label === 'B2C') return family.segmentType === 'individual';
      if (s.label === 'B2B') return nonIndividual && family.segmentType !== 'marketplace_side';
      if (s.label === 'B2B2C') return true;
      if (s.label === 'Marketplace / Two-sided') return family.segmentType === 'marketplace_side';
      return false;
    });

    const supportingSignals = [
      ...useCaseMatches,
      ...lifecycleMatches,
      ...industrySignals,
      ...companyTypeSignals,
      ...companySizeSignals,
      ...buyerSignalsMatched,
      ...businessModelMatched,
    ];

    if (anchorConfidence < MIN_SUPPORTED_ANCHOR_CONFIDENCE) return null;
    if (anchorConfidence < MIN_STANDALONE_CONFIDENCE && supportingSignals.length === 0) return null;

    const contributing = [...anchorSignals, ...supportingSignals];
    const sources = new Set(contributing.flatMap((s) => s.sources));
    const confidenceScore = this.clamp(
      Math.round(anchorConfidence * 0.5 + Math.min(supportingSignals.length, 4) * 8 + Math.min(sources.size, 3) * 6),
      0,
      100,
    );

    const evidence = this.dedupe(contributing.flatMap((s) => s.evidence)).slice(0, this.getMaxEvidence());
    const name = this.generateName(family, useCaseMatches);
    const id = this.slugify(name);

    const usedLabels = new Set<string>(contributing.map((s) => s.label));

    const segment: AudienceSegment = {
      id,
      name,
      segmentType: family.segmentType,
      roles: anchorAxis === 'role' ? anchorSignals.map((s) => s.label) : [],
      userTypes: anchorAxis === 'user_type' ? anchorSignals.map((s) => s.label) : [],
      companyTypes: companyTypeSignals.map((s) => s.label),
      companySizes: companySizeSignals.map((s) => s.label),
      industries: industrySignals.map((s) => s.label),
      useCases: useCaseMatches.map((s) => s.label),
      lifecycleStages: lifecycleMatches.map((s) => s.label),
      buyerSignals: buyerSignalsMatched.map((s) => s.label),
      businessModelSignals: businessModelMatched.map((s) => s.label),
      confidenceScore,
      evidence,
      sourceSignals: contributing.map((s) => s.label),
      warnings: anchorConfidence < 50 ? ['This segment is based on limited supporting evidence.'] : [],
    };

    return { segment, usedLabels };
  }

  private generateName(family: AnchorFamily, useCaseMatches: AudienceSignal[]): string {
    let best: { label: string; weight: number } | undefined;
    for (const signal of useCaseMatches) {
      const entry = (USE_CASE_COMPATIBILITY[signal.label] ?? []).find((e) => e.family === family.key);
      if (entry && (!best || entry.weight > best.weight)) best = { label: signal.label, weight: entry.weight };
    }
    if (best) {
      const template = NAME_TEMPLATES[`${family.key}::${best.label}`];
      if (template) return template;
    }
    return family.defaultName;
  }

  private computeOverallConfidence(
    signalResult: AudienceSignalResult,
    segments: AudienceSegment[],
    ungroupedSignals: string[],
  ): number {
    const primaryConfidence = segments[0]?.confidenceScore ?? 0;
    const score =
      signalResult.confidenceScore * 0.4 +
      Math.min(segments.length, 3) * 10 +
      primaryConfidence * 0.3 -
      Math.min(15, ungroupedSignals.length * 3);
    return this.clamp(Math.round(score), 0, 100);
  }

  private buildWarnings(signalResult: AudienceSignalResult, segments: AudienceSegment[], ungroupedSignals: string[]): string[] {
    const warnings: string[] = [];
    if (signalResult.confidenceScore < 40) warnings.push('Audience segmentation is based on limited audience evidence.');
    if (ungroupedSignals.length > 0) warnings.push('Some audience signals could not be grouped confidently.');
    if (segments.length > 1) warnings.push('Multiple distinct audience groups were detected.');
    warnings.push('Segment names are deterministic summaries of detected public evidence.');
    return this.dedupe(warnings);
  }

  private groupByCategory(signals: AudienceSignal[]): Partial<Record<AudienceSignalCategory, AudienceSignal[]>> {
    const grouped: Partial<Record<AudienceSignalCategory, AudienceSignal[]>> = {};
    for (const signal of signals) {
      if (!grouped[signal.category]) grouped[signal.category] = [];
      grouped[signal.category]!.push(signal);
    }
    return grouped;
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
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

  private getMaxSegments(): number {
    return this.getEnvNumber('AUDIENCE_SEGMENT_MAX_SEGMENTS', DEFAULT_MAX_SEGMENTS);
  }

  private getMaxEvidence(): number {
    return this.getEnvNumber('AUDIENCE_SEGMENT_MAX_EVIDENCE', DEFAULT_MAX_EVIDENCE);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
