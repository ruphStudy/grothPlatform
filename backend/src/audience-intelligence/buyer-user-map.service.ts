import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AudienceSegmentService } from './audience-segment.service';
import { AudienceSignalService } from './audience-signal.service';
import { IcpService } from './icp.service';
import type { AudienceSegment, AudienceSegmentResult } from './types/audience-segment.types';
import type { AudienceSignalResult } from './types/audience-signal.types';
import type {
  AudienceCommercialRole,
  BuyerUserEntity,
  BuyerUserMapResult,
  BuyerUserRelationship,
  BuyerUserRelationshipType,
} from './types/buyer-user-map.types';
import type { IcpResult } from './types/icp.types';

const DEFAULT_MIN_RELATIONSHIP_CONFIDENCE = 50;
const DEFAULT_MAX_RELATIONSHIPS = 15;

const END_USER_LIFECYCLE_STAGES = new Set(['Practice', 'Daily Usage', 'Training', 'Reporting']);
const BUSINESS_LIKE_TYPES = new Set(['team', 'business', 'institution']);
const ECONOMIC_BUYER_SIGNALS = new Set(['Business Owner', 'Procurement']);
const DECISION_MAKER_SIGNALS = new Set(['Hiring Manager', 'Business Owner', 'Administrator', 'IT Team']);
const ADMINISTRATOR_SIGNALS = new Set(['Administrator', 'HR Team', 'IT Team']);
const INFLUENCER_ELIGIBLE_ROLES = new Set(['Teachers', 'Recruiters', 'Managers', 'Developers']);
const BENEFICIARY_ELIGIBLE_ROLES = new Set(['Candidates', 'Students']);

interface RoleAssignment {
  role: AudienceCommercialRole;
  strength: number;
  reason: string;
}

@Injectable()
export class BuyerUserMapService {
  constructor(
    private readonly configService: ConfigService,
    private readonly audienceSignalService: AudienceSignalService,
    private readonly audienceSegmentService: AudienceSegmentService,
    private readonly icpService: IcpService,
  ) {}

  /**
   * Product-scoped orchestration. Runs 10A extraction, 10B segmentation,
   * and 10C's pure detect() exactly once each, then map() (pure) — no
   * website re-fetch, no re-segmentation, no re-detection, no network
   * calls of its own.
   */
  async mapForProduct(
    organizationId: string,
    productId: string,
    userId: string,
  ): Promise<{ signals: AudienceSignalResult; segments: AudienceSegmentResult; icp: IcpResult; buyerUserMap: BuyerUserMapResult }> {
    const signals = await this.audienceSignalService.extractForProduct(organizationId, productId, userId);
    const segments = this.audienceSegmentService.construct(signals);
    const icp = this.icpService.detect({ signals, segments });
    const buyerUserMap = this.map({ signals, segments, icp });
    return { signals, segments, icp, buyerUserMap };
  }

  map(input: { signals: AudienceSignalResult; segments: AudienceSegmentResult; icp: IcpResult }): BuyerUserMapResult {
    const { segments, icp } = input;
    const icpBySegmentId = new Map(icp.candidates.map((c) => [c.segmentId, c]));

    // Pass 1: role assignment excluding beneficiary (needs cross-segment context).
    const roleAssignments = new Map<string, RoleAssignment[]>();
    for (const segment of segments.segments) {
      roleAssignments.set(segment.id, this.assignRoles(segment));
    }

    // Pass 2: beneficiary — only when a compatible buyer/administrator/decision-maker segment exists elsewhere.
    const hasCommercialCounterpart = segments.segments.some((s) =>
      (roleAssignments.get(s.id) ?? []).some((a) => a.role === 'buyer' || a.role === 'administrator' || a.role === 'decision_maker'),
    );
    for (const segment of segments.segments) {
      if (!BENEFICIARY_ELIGIBLE_ROLES.has(segment.roles[0] ?? '')) continue;
      if (!hasCommercialCounterpart) continue;
      const assignments = roleAssignments.get(segment.id)!;
      if (assignments.some((a) => a.role === 'buyer' || a.role === 'administrator')) continue; // this segment itself already commercial
      assignments.push({ role: 'beneficiary', strength: 60, reason: 'Another segment in this result carries buyer/administrator evidence, suggesting this audience receives value without purchasing or administering the product.' });
    }

    const entities: BuyerUserEntity[] = segments.segments.map((segment) =>
      this.buildEntity(segment, roleAssignments.get(segment.id) ?? [], icpBySegmentId.get(segment.id)),
    );

    const relationships = this.buildRelationships(segments.segments, roleAssignments);

    const endUserSegmentIds = entities.filter((e) => e.commercialRoles.includes('end_user')).map((e) => e.segmentId);
    const buyerSegmentIds = entities.filter((e) => e.commercialRoles.includes('buyer')).map((e) => e.segmentId);
    const decisionMakerSegmentIds = entities.filter((e) => e.commercialRoles.includes('decision_maker')).map((e) => e.segmentId);
    const administratorSegmentIds = entities.filter((e) => e.commercialRoles.includes('administrator')).map((e) => e.segmentId);

    const primaryBuyerSegmentId = this.selectPrimaryBuyer(entities, icpBySegmentId);
    const primaryUserSegmentId = this.selectPrimaryUser(entities, icpBySegmentId, icp.primaryIcpId);

    const confidenceScore = this.computeOverallConfidence(input, entities, primaryBuyerSegmentId, primaryUserSegmentId);
    const missingEvidence = this.buildMissingEvidence(entities, relationships, endUserSegmentIds, primaryBuyerSegmentId);
    const warnings = this.buildWarnings(segments, entities, primaryBuyerSegmentId, primaryUserSegmentId);

    return {
      entities,
      relationships,
      endUserSegmentIds,
      buyerSegmentIds,
      decisionMakerSegmentIds,
      administratorSegmentIds,
      primaryBuyerSegmentId,
      primaryUserSegmentId,
      confidenceScore,
      missingEvidence,
      warnings,
      generatedAt: new Date(),
    };
  }

  private assignRoles(segment: AudienceSegment): RoleAssignment[] {
    const assignments: RoleAssignment[] = [];
    const businessLike = BUSINESS_LIKE_TYPES.has(segment.segmentType);
    const hasEndUserLifecycle = segment.lifecycleStages.some((l) => END_USER_LIFECYCLE_STAGES.has(l));
    const anchorLabel = segment.roles[0] ?? segment.userTypes[0];

    // End User
    if (segment.useCases.length > 0 || hasEndUserLifecycle || segment.segmentType === 'individual' || segment.segmentType === 'marketplace_side') {
      assignments.push({
        role: 'end_user',
        strength: 60 + (segment.useCases.length > 0 ? 15 : 0) + (hasEndUserLifecycle ? 10 : 0),
        reason: segment.useCases.length > 0
          ? `${anchorLabel ?? 'This segment'} directly performs use case(s): ${segment.useCases.join(', ')}.`
          : `${anchorLabel ?? 'This segment'} is an individual/direct-use audience anchor.`,
      });
    }

    // Buyer — requires business-like segment type, explicit buyer signal, and a relevant use case.
    if (businessLike && segment.buyerSignals.length > 0 && segment.useCases.length > 0) {
      assignments.push({
        role: 'buyer',
        strength: 70 + Math.min(segment.buyerSignals.length, 2) * 10,
        reason: `Explicit buyer signal(s) (${segment.buyerSignals.join(', ')}) with a business/team audience and a relevant use case.`,
      });
    }

    // Economic Buyer — stronger evidence only.
    const economicBuyerSignal = segment.buyerSignals.find((b) => ECONOMIC_BUYER_SIGNALS.has(b));
    if (economicBuyerSignal) {
      assignments.push({ role: 'economic_buyer', strength: 80, reason: `Explicit "${economicBuyerSignal}" evidence indicates purchasing/budget responsibility.` });
    }

    // Decision Maker
    const decisionSignal = segment.buyerSignals.find((b) => DECISION_MAKER_SIGNALS.has(b));
    if (decisionSignal && businessLike) {
      assignments.push({ role: 'decision_maker', strength: 75, reason: `"${decisionSignal}" buyer evidence in a business context supports decision-making authority.` });
    }

    // Administrator
    const adminSignal = segment.buyerSignals.find((b) => ADMINISTRATOR_SIGNALS.has(b));
    if (adminSignal || segment.segmentType === 'institution') {
      assignments.push({
        role: 'administrator',
        strength: 70,
        reason: adminSignal
          ? `"${adminSignal}" buyer evidence supports an administrative/management role.`
          : 'Institution-type audience with organizational administration context.',
      });
    }

    // Influencer — participates in evaluation/use but purchasing evidence is absent/weaker.
    if (anchorLabel && segment.roles.some((r) => INFLUENCER_ELIGIBLE_ROLES.has(r)) && segment.buyerSignals.length === 0 && segment.useCases.length > 0) {
      assignments.push({ role: 'influencer', strength: 55, reason: `${anchorLabel} participates in product evaluation/use without explicit purchasing evidence.` });
    }

    return assignments;
  }

  private buildEntity(segment: AudienceSegment, assignments: RoleAssignment[], icpCandidate: IcpResult['candidates'][number] | undefined): BuyerUserEntity {
    const commercialRoles = Array.from(new Set(assignments.map((a) => a.role)));
    const reasons = assignments.map((a) => a.reason);
    const avgStrength = assignments.length > 0 ? assignments.reduce((s, a) => s + a.strength, 0) / assignments.length : 0;

    const icpBonus = icpCandidate ? (icpCandidate.fitScore / 100) * 15 : 0;
    const sourceQualityBonus = Math.min(10, segment.sourceSignals.length * 2);
    const manyWeakRolesPenalty = commercialRoles.length >= 3 && avgStrength < 60 ? 10 : 0;

    const confidenceScore = this.clamp(
      Math.round(segment.confidenceScore * 0.4 + avgStrength * 0.3 + icpBonus + sourceQualityBonus - manyWeakRolesPenalty),
      0,
      100,
    );

    const warnings: string[] = [];
    if (commercialRoles.length === 0) warnings.push('No commercial role could be confidently assigned to this segment.');

    return {
      segmentId: segment.id,
      segmentName: segment.name,
      roles: [...segment.roles, ...segment.userTypes],
      commercialRoles,
      confidenceScore,
      evidence: segment.evidence,
      reasons: this.dedupe(reasons),
      warnings,
    };
  }

  private buildRelationships(
    segments: AudienceSegment[],
    roleAssignments: Map<string, RoleAssignment[]>,
  ): BuyerUserRelationship[] {
    const relationships: BuyerUserRelationship[] = [];
    const roleMap = new Map(segments.map((s) => [s.id, new Set((roleAssignments.get(s.id) ?? []).map((a) => a.role))]));
    const strengthMap = new Map(segments.map((s) => [s.id, roleAssignments.get(s.id) ?? []]));

    const addIfConfident = (fromId: string, toId: string, relationship: BuyerUserRelationshipType, fromStrength: number, toStrength: number, reasons: string[]) => {
      const confidenceScore = this.clamp(Math.round((fromStrength + toStrength) / 2), 0, 100);
      if (confidenceScore < this.getMinRelationshipConfidence()) return;
      if (relationships.length >= this.getMaxRelationships()) return;
      relationships.push({ fromSegmentId: fromId, toSegmentId: toId, relationship, confidenceScore, reasons });
    };

    for (const a of segments) {
      const aRoles = roleMap.get(a.id)!;
      const aStrengths = strengthMap.get(a.id)!;
      const isCommercial = aRoles.has('buyer') || aRoles.has('administrator') || aRoles.has('decision_maker') || aRoles.has('influencer');
      if (!isCommercial) continue;

      for (const b of segments) {
        if (a.id === b.id) continue;
        const bRoles = roleMap.get(b.id)!;
        if (!bRoles.has('end_user') && !bRoles.has('beneficiary')) continue;

        const strengthFor = (role: AudienceCommercialRole) => aStrengths.find((x) => x.role === role)?.strength ?? 0;
        const bEndUserStrength = (strengthMap.get(b.id) ?? []).find((x) => x.role === 'end_user')?.strength ?? 50;

        if (aRoles.has('buyer')) {
          addIfConfident(a.id, b.id, 'buys_for', strengthFor('buyer'), bEndUserStrength, [`${a.name} shows buyer evidence; ${b.name} is a supported end-user audience.`]);
        }
        if (aRoles.has('administrator')) {
          addIfConfident(a.id, b.id, 'administers_for', strengthFor('administrator'), bEndUserStrength, [`${a.name} shows administrative evidence over ${b.name}.`]);
        }
        if (aRoles.has('decision_maker')) {
          addIfConfident(a.id, b.id, 'decides_for', strengthFor('decision_maker'), bEndUserStrength, [`${a.name} shows decision-making evidence affecting ${b.name}.`]);
        }
        if (!aRoles.has('buyer') && !aRoles.has('administrator') && aRoles.has('influencer')) {
          addIfConfident(a.id, b.id, 'influences', strengthFor('influencer'), bEndUserStrength, [`${a.name} participates in evaluation/use alongside ${b.name} without purchasing evidence.`]);
        }
      }
    }

    // Marketplace sides: both end_user, no buyer/admin distinction — connect once.
    const marketplaceSegments = segments.filter((s) => s.segmentType === 'marketplace_side' && roleMap.get(s.id)?.has('end_user'));
    if (marketplaceSegments.length === 2) {
      const [s1, s2] = marketplaceSegments;
      addIfConfident(s1.id, s2.id, 'uses_with', 60, 60, [`${s1.name} and ${s2.name} represent two sides of the same marketplace.`]);
    }

    return relationships;
  }

  private selectPrimaryBuyer(entities: BuyerUserEntity[], icpBySegmentId: Map<string, IcpResult['candidates'][number]>): string | undefined {
    const buyerLike = entities.filter((e) => e.commercialRoles.includes('buyer') || e.commercialRoles.includes('decision_maker'));
    if (buyerLike.length === 0) return undefined;
    return buyerLike
      .sort((a, b) => {
        const roleConf = b.confidenceScore - a.confidenceScore;
        if (roleConf !== 0) return roleConf;
        const aFit = icpBySegmentId.get(a.segmentId)?.fitScore ?? 0;
        const bFit = icpBySegmentId.get(b.segmentId)?.fitScore ?? 0;
        return bFit - aFit;
      })[0].segmentId;
  }

  private selectPrimaryUser(
    entities: BuyerUserEntity[],
    icpBySegmentId: Map<string, IcpResult['candidates'][number]>,
    primaryIcpId: string | undefined,
  ): string | undefined {
    const endUserLike = entities.filter((e) => e.commercialRoles.includes('end_user'));
    if (endUserLike.length === 0) return undefined;

    const primaryIcpSegment = primaryIcpId ? Array.from(icpBySegmentId.entries()).find(([, c]) => c.id === primaryIcpId)?.[0] : undefined;
    if (primaryIcpSegment && endUserLike.some((e) => e.segmentId === primaryIcpSegment)) {
      return primaryIcpSegment;
    }

    return endUserLike
      .sort((a, b) => {
        const aFit = icpBySegmentId.get(a.segmentId)?.fitScore ?? 0;
        const bFit = icpBySegmentId.get(b.segmentId)?.fitScore ?? 0;
        if (bFit !== aFit) return bFit - aFit;
        return b.confidenceScore - a.confidenceScore;
      })[0].segmentId;
  }

  private computeOverallConfidence(
    input: { signals: AudienceSignalResult; segments: AudienceSegmentResult; icp: IcpResult },
    entities: BuyerUserEntity[],
    primaryBuyerSegmentId: string | undefined,
    primaryUserSegmentId: string | undefined,
  ): number {
    const buyerConf = primaryBuyerSegmentId ? entities.find((e) => e.segmentId === primaryBuyerSegmentId)?.confidenceScore ?? 0 : 0;
    const userConf = primaryUserSegmentId ? entities.find((e) => e.segmentId === primaryUserSegmentId)?.confidenceScore ?? 0 : 0;
    const score = input.icp.confidenceScore * 0.3 + input.segments.confidenceScore * 0.3 + userConf * 0.2 + buyerConf * 0.2;
    return this.clamp(Math.round(score), 0, 100);
  }

  private buildMissingEvidence(
    entities: BuyerUserEntity[],
    relationships: BuyerUserRelationship[],
    endUserSegmentIds: string[],
    primaryBuyerSegmentId: string | undefined,
  ): string[] {
    const missing: string[] = [];
    if (!primaryBuyerSegmentId) missing.push('Primary purchasing role could not be determined.');
    if (entities.length > 1 && relationships.length === 0) missing.push('No clear buyer-to-user relationship was detected.');
    if (endUserSegmentIds.length === 0) missing.push('Direct end-user evidence is limited.');
    if (!entities.some((e) => e.commercialRoles.includes('economic_buyer'))) missing.push('Economic buyer evidence was not found.');
    return missing;
  }

  private buildWarnings(
    segments: AudienceSegmentResult,
    entities: BuyerUserEntity[],
    primaryBuyerSegmentId: string | undefined,
    primaryUserSegmentId: string | undefined,
  ): string[] {
    const warnings: string[] = ['Buyer/user mapping is inferred from public product evidence and should be validated.'];
    const totalBuyerSignals = segments.segments.reduce((sum, s) => sum + s.buyerSignals.length, 0);
    if (totalBuyerSignals === 0) warnings.push('Buyer signals are limited.');
    if (entities.some((e) => e.commercialRoles.length >= 2)) warnings.push('Some segments may serve multiple commercial roles.');
    if (primaryBuyerSegmentId && primaryBuyerSegmentId === primaryUserSegmentId) {
      warnings.push('Primary buyer and primary user may be the same segment.');
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

  private getMinRelationshipConfidence(): number {
    return this.getEnvNumber('BUYER_USER_MIN_RELATIONSHIP_CONFIDENCE', DEFAULT_MIN_RELATIONSHIP_CONFIDENCE);
  }

  private getMaxRelationships(): number {
    return this.getEnvNumber('BUYER_USER_MAX_RELATIONSHIPS', DEFAULT_MAX_RELATIONSHIPS);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
