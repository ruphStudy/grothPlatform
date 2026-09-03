import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AudiencePainPointService } from './audience-pain-point.service';
import { AudienceSegmentService } from './audience-segment.service';
import { AudienceSignalService } from './audience-signal.service';
import { BuyerUserMapService } from './buyer-user-map.service';
import { IcpService } from './icp.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/audience')
export class AudienceIntelligenceController {
  constructor(
    private readonly audienceSignalService: AudienceSignalService,
    private readonly audienceSegmentService: AudienceSegmentService,
    private readonly icpService: IcpService,
    private readonly buyerUserMapService: BuyerUserMapService,
    private readonly audiencePainPointService: AudiencePainPointService,
  ) {}

  @Post('signals-preview')
  signalsPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.audienceSignalService.extractForProduct(organizationId, productId, req.user.userId);
  }

  @Post('segments-preview')
  async segmentsPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    const signals = await this.audienceSignalService.extractForProduct(organizationId, productId, req.user.userId);
    return this.audienceSegmentService.construct(signals);
  }

  @Post('icp-preview')
  async icpPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    const { signals, segments, icp } = await this.icpService.detectForProduct(organizationId, productId, req.user.userId);
    return {
      signalsSummary: {
        confidenceScore: signals.confidenceScore,
        roles: signals.roles,
        useCases: signals.useCases,
        businessModelSignals: signals.businessModelSignals,
      },
      segmentsSummary: {
        count: segments.segments.length,
        primarySegmentId: segments.primarySegmentId,
        confidenceScore: segments.confidenceScore,
      },
      icp,
    };
  }

  @Post('buyer-user-preview')
  async buyerUserPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    const { signals, segments, icp, buyerUserMap } = await this.buyerUserMapService.mapForProduct(
      organizationId,
      productId,
      req.user.userId,
    );
    return {
      signalsSummary: { confidenceScore: signals.confidenceScore },
      segmentsSummary: { count: segments.segments.length, confidenceScore: segments.confidenceScore },
      icpSummary: { count: icp.candidates.length, primaryIcpId: icp.primaryIcpId, confidenceScore: icp.confidenceScore },
      buyerUserMap,
    };
  }

  @Post('pain-points-preview')
  async painPointsPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    const { signals, segments, icp, buyerUserMap, painPoints } = await this.audiencePainPointService.identifyForProduct(
      organizationId,
      productId,
      req.user.userId,
    );
    return {
      signalsSummary: { confidenceScore: signals.confidenceScore },
      segmentsSummary: { count: segments.segments.length, confidenceScore: segments.confidenceScore },
      icpSummary: { count: icp.candidates.length, primaryIcpId: icp.primaryIcpId, confidenceScore: icp.confidenceScore },
      buyerUserSummary: { entityCount: buyerUserMap.entities.length, confidenceScore: buyerUserMap.confidenceScore },
      painPoints,
    };
  }
}
