import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AudienceSegmentService } from './audience-segment.service';
import { AudienceSignalService } from './audience-signal.service';
import type { AudienceSegment, AudienceSegmentResult } from './types/audience-segment.types';
import type { AudienceSignalResult } from './types/audience-signal.types';
import type { IcpCandidate, IcpFitLevel, IcpResult } from './types/icp.types';

const DEFAULT_MIN_SEGMENT_CONFIDENCE = 50;
const DEFAULT_MIN_FIT_SCORE = 45;
const DEFAULT_MAX_CANDIDATES = 5;
const DEFAULT_MAX_EVIDENCE = 10;

const STRONG_EXPLICIT_THRESHOLD = 75;
const BUSINESS_LIKE_TYPES = new Set(['team', 'business', 'institution']);

const ROLE_LABEL_PLURAL: Record<string, string> = {
  Candidates: 'candidates',
  Recruiters: 'HR and hiring teams',
  'Hiring Managers': 'HR and hiring teams',
  'HR Teams': 'HR and hiring teams',
  Students: 'students',
  Teachers: 'teachers',
  Developers: 'developers',
  Marketers: 'marketing teams',
  'Sales Representatives': 'sales teams',
  'Sales Managers': 'sales teams',
  Founders: 'founders and business owners',
  'Business Owners': 'founders and business owners',
  Administrators: 'administrators',
  'Healthcare Professionals': 'healthcare professionals',
};

const USER_TYPE_LABEL_PLURAL: Record<string, string> = {
  'Marketplace Seller': 'marketplace sellers',
  'Marketplace Buyer': 'marketplace buyers',
  Consumer: 'consumers',
  Enterprise: 'enterprise teams',
  Agency: 'agencies',
  'School / Institution': 'schools and institutions',
  'Individual User': 'individual users',
};

const COMPANY_SIZE_PREFIX: Record<string, string> = {
  Enterprise: 'Enterprise',
  'Small Business': 'Small-business',
  Startup: 'Startup',
  'Mid-Market': 'Mid-market',
};

const COMPANY_TYPE_PHRASE: Record<string, string> = {
  'Educational Institution': 'educational institutions',
  Agency: 'agencies',
  'Software Company': 'software companies',
  'Healthcare Organization': 'healthcare organizations',
  Enterprise: 'enterprise organizations',
  Startup: 'startups',
  SMB: 'small and medium businesses',
  'E-commerce Business': 'e-commerce businesses',
};

@Injectable()
export class IcpService {
  constructor(
    private readonly configService: ConfigService,
    private readonly audienceSignalService: AudienceSignalService,
    private readonly audienceSegmentService: AudienceSegmentService,
  ) {}

  /**
   * Product-scoped orchestration. Runs Sprint 10A extraction and Sprint 10B
   * segmentation exactly once each, then detect() (pure) on the result — no
   * website re-fetch, no re-segmentation, no network calls of its own.
   */
  async detectForProduct(
    organizationId: string,
    productId: string,
    userId: string,
  ): Promise<{ signals: AudienceSignalResult; segments: AudienceSegmentResult; icp: IcpResult }> {
    const signals = await this.audienceSignalService.extractForProduct(organizationId, productId, userId);
    const segments = this.audienceSegmentService.construct(signals);
    const icp = this.detect({ signals, segments });
    return { signals, segments, icp };
  }

  detect(input: { signals: AudienceSignalResult; segments: AudienceSegmentResult }): IcpResult {
    const { signals, segments } = input;

    const candidates = segments.segments
      .map((segment) => this.buildCandidate(segment))
      .filter((c): c is IcpCandidate => c !== null && c.fitScore >= this.getMinFitScore())
      .sort((a, b) => b.fitScore - a.fitScore || b.confidenceScore - a.confidenceScore || a.id.localeCompare(b.id))
      .slice(0, this.getMaxCandidates());

    const primary = candidates[0];
    const confidenceScore = this.computeOverallConfidence(candidates, segments, signals);
    const missingEvidence = this.buildGlobalMissingEvidence(candidates);
    const warnings = this.buildWarnings(signals, segments);

    return {
      candidates,
      primaryIcpId: primary?.id,
      confidenceScore,
      missingEvidence,
      warnings,
      generatedAt: new Date(),
    };
  }

  private buildCandidate(segment: AudienceSegment): IcpCandidate | null {
    const hasUseCase = segment.useCases.length > 0;
    const eligible = segment.confidenceScore >= this.getMinSegmentConfidence() && (hasUseCase || segment.confidenceScore >= STRONG_EXPLICIT_THRESHOLD);
    if (!eligible) return null;

    const businessLike = BUSINESS_LIKE_TYPES.has(segment.segmentType);

    const useCaseComponent = hasUseCase ? 100 : 0;
    const buyerComponent = businessLike ? (segment.buyerSignals.length > 0 ? 100 : 40) : 100;
    const businessModelComponent = segment.businessModelSignals.length > 0 ? 100 : 50;
    const contextSignalsPresent = [segment.companyTypes.length > 0, segment.companySizes.length > 0, segment.industries.length > 0].filter(Boolean).length;
    const companyContextComponent = (contextSignalsPresent / 3) * 100;

    const fitScore = this.clamp(
      Math.round(
        segment.confidenceScore * 0.35 +
          useCaseComponent * 0.25 +
          buyerComponent * 0.15 +
          businessModelComponent * 0.15 +
          companyContextComponent * 0.1,
      ),
      0,
      100,
    );

    const confidenceScore = this.computeCandidateConfidence(segment, businessLike);
    const fitLevel = this.fitLevel(fitScore);

    const reasons = this.buildReasons(segment, businessLike);
    const missingEvidence = this.buildCandidateMissingEvidence(segment, businessLike);
    const warnings = businessLike && segment.buyerSignals.length === 0 ? ['Purchasing-role evidence is limited for this ICP candidate.'] : [];

    const evidence = this.dedupe(segment.evidence).slice(0, this.getMaxEvidence());
    const name = this.generateName(segment);
    const id = `icp-${this.slugify(name)}`;

    return {
      id,
      name,
      segmentId: segment.id,
      segmentName: segment.name,
      fitScore,
      confidenceScore,
      fitLevel,
      roles: segment.roles,
      userTypes: segment.userTypes,
      companyTypes: segment.companyTypes,
      companySizes: segment.companySizes,
      industries: segment.industries,
      useCases: segment.useCases,
      buyerSignals: segment.buyerSignals,
      businessModelSignals: segment.businessModelSignals,
      reasons,
      evidence,
      missingEvidence,
      warnings,
    };
  }

  private computeCandidateConfidence(segment: AudienceSegment, businessLike: boolean): number {
    const sourceDiversityBonus = Math.min(20, segment.sourceSignals.length * 3);
    const explicitAnchorBonus = 10; // 10B anchors are always explicit role/user-type evidence by construction
    let missingContextPenalty = 0;
    if (businessLike && segment.buyerSignals.length === 0) missingContextPenalty += 10;
    if (businessLike && segment.companyTypes.length === 0 && segment.companySizes.length === 0) missingContextPenalty += 5;

    return this.clamp(
      Math.round(segment.confidenceScore * 0.6 + sourceDiversityBonus + explicitAnchorBonus - missingContextPenalty),
      0,
      100,
    );
  }

  private buildReasons(segment: AudienceSegment, businessLike: boolean): string[] {
    const reasons: string[] = [];
    const anchorLabel = segment.roles[0] ?? segment.userTypes[0];
    if (anchorLabel) reasons.push(`Strong explicit ${anchorLabel} audience evidence.`);
    for (const useCase of segment.useCases.slice(0, 2)) {
      reasons.push(`${useCase} is a directly supported use case.`);
    }
    for (const model of segment.businessModelSignals) {
      reasons.push(`${model} audience model aligns with the ${segment.segmentType.replace('_', '-')} segment.`);
    }
    if (businessLike && segment.buyerSignals.length > 0) {
      reasons.push(`${segment.buyerSignals[0]} buyer evidence supports a business purchasing context.`);
    }
    if (segment.companySizes.length > 0) {
      reasons.push(`${segment.companySizes[0]} targeting is explicitly present in audience evidence.`);
    }
    return reasons;
  }

  private buildCandidateMissingEvidence(segment: AudienceSegment, businessLike: boolean): string[] {
    const missing: string[] = [];
    if (segment.companySizes.length === 0) missing.push('Company-size targeting is not specified.');
    if (businessLike && segment.buyerSignals.length === 0) missing.push('Purchasing-role evidence is limited.');
    if (segment.industries.length === 0) missing.push('Specific industry targeting is not established.');
    if (segment.sourceSignals.length <= 1) missing.push('Only one evidence source supports this ICP.');
    return missing;
  }

  private buildGlobalMissingEvidence(candidates: IcpCandidate[]): string[] {
    const missing: string[] = [];
    if (candidates.length === 0) {
      missing.push('No high-confidence customer segment was detected.');
      return missing;
    }
    const businessLikeCandidates = candidates.filter(
      (c) => c.buyerSignals.length > 0 || c.warnings.includes('Purchasing-role evidence is limited for this ICP candidate.'),
    );
    if (businessLikeCandidates.length > 0 && businessLikeCandidates.every((c) => c.buyerSignals.length === 0)) {
      missing.push('Buyer evidence is limited across business audience segments.');
    }
    if (candidates.every((c) => c.companySizes.length === 0)) missing.push('Company-size targeting is not available.');
    if (candidates.every((c) => c.businessModelSignals.length === 0)) missing.push('Business-model evidence is unclear.');
    return missing;
  }

  private buildWarnings(signals: AudienceSignalResult, segments: AudienceSegmentResult): string[] {
    const warnings: string[] = [
      'ICP detection is based on observed audience/product evidence, not validated customer revenue data.',
      'ICP candidates represent product-fit hypotheses and require validation.',
    ];
    if (signals.confidenceScore < 40 || segments.confidenceScore < 40) {
      warnings.push('Limited audience evidence reduces ICP confidence.');
    }
    return this.dedupe(warnings);
  }

  private computeOverallConfidence(candidates: IcpCandidate[], segments: AudienceSegmentResult, signals: AudienceSignalResult): number {
    const primary = candidates[0];
    if (!primary) {
      return this.clamp(Math.round(segments.confidenceScore * 0.3 + signals.confidenceScore * 0.2), 0, 30);
    }
    return this.clamp(Math.round(primary.confidenceScore * 0.5 + segments.confidenceScore * 0.3 + signals.confidenceScore * 0.2), 0, 100);
  }

  private generateName(segment: AudienceSegment): string {
    const base = this.baseAudienceLabel(segment);

    if (segment.companySizes.length > 0 && base) {
      const prefix = COMPANY_SIZE_PREFIX[segment.companySizes[0]] ?? segment.companySizes[0];
      return this.capitalize(`${prefix} ${base}`);
    }
    if (segment.companyTypes.length > 0 && base) {
      const typePhrase = COMPANY_TYPE_PHRASE[segment.companyTypes[0]] ?? segment.companyTypes[0].toLowerCase();
      return this.capitalize(`${base} at ${typePhrase}`);
    }
    return segment.name;
  }

  private baseAudienceLabel(segment: AudienceSegment): string | undefined {
    if (segment.roles.length > 0 && ROLE_LABEL_PLURAL[segment.roles[0]]) return ROLE_LABEL_PLURAL[segment.roles[0]];
    if (segment.userTypes.length > 0 && USER_TYPE_LABEL_PLURAL[segment.userTypes[0]]) return USER_TYPE_LABEL_PLURAL[segment.userTypes[0]];
    return undefined;
  }

  private fitLevel(fitScore: number): IcpFitLevel {
    if (fitScore >= 80) return 'strong';
    if (fitScore >= 55) return 'moderate';
    return 'weak';
  }

  private capitalize(value: string): string {
    return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
  }

  private slugify(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
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

  private getMinSegmentConfidence(): number {
    return this.getEnvNumber('ICP_MIN_SEGMENT_CONFIDENCE', DEFAULT_MIN_SEGMENT_CONFIDENCE);
  }

  private getMinFitScore(): number {
    return this.getEnvNumber('ICP_MIN_FIT_SCORE', DEFAULT_MIN_FIT_SCORE);
  }

  private getMaxCandidates(): number {
    return this.getEnvNumber('ICP_MAX_CANDIDATES', DEFAULT_MAX_CANDIDATES);
  }

  private getMaxEvidence(): number {
    return this.getEnvNumber('ICP_MAX_EVIDENCE', DEFAULT_MAX_EVIDENCE);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
