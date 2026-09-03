import { Injectable } from '@nestjs/common';
import { AudienceJtbdService } from './audience-jtbd.service';
import { AudiencePainPointService } from './audience-pain-point.service';
import { AudiencePrioritizationService } from './audience-prioritization.service';
import { AudienceSegmentService } from './audience-segment.service';
import { AudienceSignalService } from './audience-signal.service';
import { BuyerUserMapService } from './buyer-user-map.service';
import { IcpService } from './icp.service';
import type { AudienceIntelligencePreview } from './types/audience-intelligence-preview.types';

/**
 * Single consolidated orchestration for the entire Sprint 10 audience
 * pipeline. Only AudienceSignalService.extractForProduct() touches the
 * network/website (with 10A's existing metadata fallback); every
 * downstream step (10B–10G) is a pure, in-memory transformation called
 * exactly once — no *ForProduct() re-orchestration, no repeated website or
 * category work.
 */
@Injectable()
export class AudienceIntelligencePreviewService {
  constructor(
    private readonly audienceSignalService: AudienceSignalService,
    private readonly audienceSegmentService: AudienceSegmentService,
    private readonly icpService: IcpService,
    private readonly buyerUserMapService: BuyerUserMapService,
    private readonly audiencePainPointService: AudiencePainPointService,
    private readonly audienceJtbdService: AudienceJtbdService,
    private readonly audiencePrioritizationService: AudiencePrioritizationService,
  ) {}

  async buildForProduct(organizationId: string, productId: string, userId: string): Promise<AudienceIntelligencePreview> {
    const signals = await this.audienceSignalService.extractForProduct(organizationId, productId, userId);
    const segments = this.audienceSegmentService.construct(signals);
    const icp = this.icpService.detect({ signals, segments });
    const buyerUserMap = this.buyerUserMapService.map({ signals, segments, icp });
    const painPoints = this.audiencePainPointService.identify({ signals, segments, icp, buyerUserMap });
    const jtbd = this.audienceJtbdService.generate({ signals, segments, icp, buyerUserMap, painPoints });
    const prioritization = this.audiencePrioritizationService.prioritize({ signals, segments, icp, buyerUserMap, painPoints, jtbd });

    const warnings = Array.from(
      new Set([
        ...signals.warnings,
        ...segments.warnings,
        ...icp.warnings,
        ...buyerUserMap.warnings,
        ...painPoints.warnings,
        ...jtbd.warnings,
        ...prioritization.warnings,
      ]),
    );

    return {
      signals,
      segments,
      icp,
      buyerUserMap,
      painPoints,
      jtbd,
      prioritization,
      stats: {
        signalCount: signals.signals.length,
        segmentCount: segments.segments.length,
        icpCandidateCount: icp.candidates.length,
        relationshipCount: buyerUserMap.relationships.length,
        painPointCount: painPoints.painPoints.length,
        jobCount: jtbd.jobs.length,
        prioritizedSegmentCount: prioritization.priorities.length,
      },
      warnings,
      generatedAt: new Date(),
    };
  }
}
