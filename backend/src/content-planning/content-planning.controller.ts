import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContentIdeaService } from './content-idea.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/campaigns/:campaignId/content-planning')
export class ContentPlanningController {
  constructor(private readonly contentIdeaService: ContentIdeaService) {}

  @Post('ideas-preview')
  generateIdeas(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.contentIdeaService.generateIdeasForCampaign(organizationId, productId, campaignId, req.user.userId);
  }
}
