import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AudienceSegmentService } from './audience-segment.service';
import { AudienceSignalService } from './audience-signal.service';
import { IcpService } from './icp.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/audience')
export class AudienceIntelligenceController {
  constructor(
    private readonly audienceSignalService: AudienceSignalService,
    private readonly audienceSegmentService: AudienceSegmentService,
    private readonly icpService: IcpService,
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
}
