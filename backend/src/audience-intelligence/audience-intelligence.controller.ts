import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AudienceSegmentService } from './audience-segment.service';
import { AudienceSignalService } from './audience-signal.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/audience')
export class AudienceIntelligenceController {
  constructor(
    private readonly audienceSignalService: AudienceSignalService,
    private readonly audienceSegmentService: AudienceSegmentService,
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
}
