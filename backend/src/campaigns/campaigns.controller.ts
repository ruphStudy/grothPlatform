import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CampaignAudienceChannelService } from './campaign-audience-channel.service';
import { CampaignGoalService } from './campaign-goal.service';
import { CampaignPlanService } from './campaign-plan.service';
import { CampaignReviewService } from './campaign-review.service';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { DeriveCampaignGoalDto } from './dto/derive-campaign-goal.dto';
import { RequestCampaignReviewChangesDto } from './dto/request-campaign-review-changes.dto';
import { SetCampaignAudienceChannelDto } from './dto/set-campaign-audience-channel.dto';
import { SetCampaignGoalDto } from './dto/set-campaign-goal.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { UpdateCampaignReviewDto } from './dto/update-campaign-review.dto';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/campaigns')
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly campaignGoalService: CampaignGoalService,
    private readonly campaignAudienceChannelService: CampaignAudienceChannelService,
    private readonly campaignPlanService: CampaignPlanService,
    private readonly campaignReviewService: CampaignReviewService,
  ) {}

  @Post()
  create(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.campaignsService.create(organizationId, productId, req.user.userId, dto);
  }

  @Get()
  findAll(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.campaignsService.findAll(organizationId, productId, req.user.userId, { status, type });
  }

  @Get(':campaignId')
  findOne(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.campaignsService.findOne(organizationId, productId, campaignId, req.user.userId);
  }

  @Patch(':campaignId')
  update(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaignsService.update(organizationId, productId, campaignId, req.user.userId, dto);
  }

  @Patch(':campaignId/goal')
  setGoal(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Body() dto: SetCampaignGoalDto,
  ) {
    return this.campaignGoalService.setManualGoal(organizationId, productId, campaignId, req.user.userId, dto);
  }

  @Post(':campaignId/goal/derive')
  deriveGoal(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Body() dto: DeriveCampaignGoalDto,
  ) {
    return this.campaignGoalService.deriveGoalForCampaign(organizationId, productId, campaignId, req.user.userId, dto?.campaignType);
  }

  @Patch(':campaignId/audience-channel')
  setAudienceChannel(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Body() dto: SetCampaignAudienceChannelDto,
  ) {
    return this.campaignAudienceChannelService.setManualMapping(organizationId, productId, campaignId, req.user.userId, dto);
  }

  @Post(':campaignId/audience-channel/derive')
  deriveAudienceChannel(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.campaignAudienceChannelService.deriveMappingForCampaign(organizationId, productId, campaignId, req.user.userId);
  }

  @Post(':campaignId/plan/generate')
  generatePlan(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.campaignPlanService.generatePlanForCampaign(organizationId, productId, campaignId, req.user.userId);
  }

  @Patch(':campaignId/review')
  saveReview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Body() dto: UpdateCampaignReviewDto,
  ) {
    return this.campaignReviewService.saveReview(organizationId, productId, campaignId, req.user.userId, dto);
  }

  @Post(':campaignId/review/approve')
  approveReview(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
  ) {
    return this.campaignReviewService.approve(organizationId, productId, campaignId, req.user.userId);
  }

  @Post(':campaignId/review/request-changes')
  requestReviewChanges(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('campaignId') campaignId: string,
    @Body() dto: RequestCampaignReviewChangesDto,
  ) {
    return this.campaignReviewService.requestChanges(organizationId, productId, campaignId, req.user.userId, dto);
  }
}
