import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContentIdeaService } from './content-idea.service';
import { ContentPillarPlanService } from './content-pillar-plan.service';
import { TopicPrioritizationService } from './topic-prioritization.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/campaigns/:campaignId/content-planning')
export class ContentPlanningController {
  constructor(
    private readonly contentIdeaService: ContentIdeaService,
    private readonly topicPrioritizationService: TopicPrioritizationService,
    private readonly contentPillarPlanService: ContentPillarPlanService,
  ) {}

  @Post('ideas-preview')
  generateIdeas(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.contentIdeaService.generateIdeasForCampaign(organizationId, productId, campaignId, req.user.userId);
  }

  @Post('topics-preview')
  prioritizeTopics(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.topicPrioritizationService.prioritizeTopicsForCampaign(organizationId, productId, campaignId, req.user.userId);
  }

  @Post('pillars-preview')
  buildPillars(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.contentPillarPlanService.buildPillarsForCampaign(organizationId, productId, campaignId, req.user.userId);
  }
}
