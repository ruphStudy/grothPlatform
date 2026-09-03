import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AudienceSignalService } from './audience-signal.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/audience')
export class AudienceIntelligenceController {
  constructor(private readonly audienceSignalService: AudienceSignalService) {}

  @Post('signals-preview')
  signalsPreview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.audienceSignalService.extractForProduct(organizationId, productId, req.user.userId);
  }
}
