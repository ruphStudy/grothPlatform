import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BlogCalendarService } from './blog-calendar.service';
import { ContentIdeaService } from './content-idea.service';
import { ContentPillarPlanService } from './content-pillar-plan.service';
import { RepurposingPlanService } from './repurposing-plan.service';
import { SocialCalendarService } from './social-calendar.service';
import { TopicPrioritizationService } from './topic-prioritization.service';
import { VideoCalendarService } from './video-calendar.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/campaigns/:campaignId/content-planning')
export class ContentPlanningController {
  constructor(
    private readonly contentIdeaService: ContentIdeaService,
    private readonly topicPrioritizationService: TopicPrioritizationService,
    private readonly contentPillarPlanService: ContentPillarPlanService,
    private readonly blogCalendarService: BlogCalendarService,
    private readonly socialCalendarService: SocialCalendarService,
    private readonly videoCalendarService: VideoCalendarService,
    private readonly repurposingPlanService: RepurposingPlanService,
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

  @Post('blog-calendar-preview')
  buildBlogCalendar(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.blogCalendarService.buildBlogCalendarForCampaign(organizationId, productId, campaignId, req.user.userId);
  }

  @Post('social-calendar-preview')
  buildSocialCalendar(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.socialCalendarService.buildSocialCalendarForCampaign(organizationId, productId, campaignId, req.user.userId);
  }

  @Post('video-calendar-preview')
  buildVideoCalendar(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.videoCalendarService.buildVideoCalendarForCampaign(organizationId, productId, campaignId, req.user.userId);
  }

  @Post('repurposing-preview')
  buildRepurposingPlan(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.repurposingPlanService.buildRepurposingPlanForCampaign(organizationId, productId, campaignId, req.user.userId);
  }
}
