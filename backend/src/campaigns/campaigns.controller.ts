import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CampaignGoalService } from './campaign-goal.service';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { DeriveCampaignGoalDto } from './dto/derive-campaign-goal.dto';
import { SetCampaignGoalDto } from './dto/set-campaign-goal.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/campaigns')
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly campaignGoalService: CampaignGoalService,
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
}
