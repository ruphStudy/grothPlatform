import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AddCrmOpportunityNoteDto, CompleteCrmFollowUpDto, ConvertLeadToOpportunityDto, CreateCrmAccountDto, CreateCrmFollowUpDto, CreateCrmOpportunityDto, CreateCrmPipelineDto, CreateCrmStageDto, ExportCrmOpportunitiesDto, LogCrmActivityDto, MoveCrmOpportunityStageDto, ReorderCrmStagesDto, UpdateCrmAccountDto, UpdateCrmFollowUpDto, UpdateCrmOpportunityDto, UpdateCrmPipelineDto, UpdateCrmStageDto } from './dto/crm.dto';
import { CrmAccountService } from './services/crm-account.service';
import { CrmDashboardService } from './services/crm-dashboard.service';
import { CrmDataHealthService } from './services/crm-data-health.service';
import { CrmFollowUpService } from './services/crm-follow-up.service';
import { CrmOpportunityService } from './services/crm-opportunity.service';
import { CrmPipelineService } from './services/crm-pipeline.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId')
export class CrmController {
  constructor(
    private readonly pipelineService: CrmPipelineService,
    private readonly opportunityService: CrmOpportunityService,
    private readonly followUpService: CrmFollowUpService,
    private readonly dashboardService: CrmDashboardService,
    private readonly accountService: CrmAccountService,
    private readonly dataHealthService: CrmDataHealthService,
  ) {}

  @Post('crm/initialize')
  initialize(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.pipelineService.ensureDefaultPipeline(organizationId, productId, req.user.userId);
  }

  @Post('crm/pipelines')
  createPipeline(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Body() body: CreateCrmPipelineDto) {
    return this.pipelineService.createPipeline(organizationId, productId, req.user.userId, body);
  }

  @Get('crm/pipelines')
  listPipelines(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.pipelineService.listPipelines(organizationId, productId, req.user.userId);
  }

  @Get('crm/pipelines/:pipelineId')
  getPipeline(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('pipelineId') pipelineId: string) {
    return this.pipelineService.getPipeline(organizationId, productId, req.user.userId, pipelineId);
  }

  @Patch('crm/pipelines/:pipelineId')
  updatePipeline(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('pipelineId') pipelineId: string, @Body() body: UpdateCrmPipelineDto) {
    return this.pipelineService.updatePipeline(organizationId, productId, req.user.userId, pipelineId, body);
  }

  @Post('crm/pipelines/:pipelineId/stages')
  createStage(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('pipelineId') pipelineId: string, @Body() body: CreateCrmStageDto) {
    return this.pipelineService.createStage(organizationId, productId, req.user.userId, pipelineId, body);
  }

  @Patch('crm/stages/:stageId')
  updateStage(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('stageId') stageId: string, @Body() body: UpdateCrmStageDto) {
    return this.pipelineService.updateStage(organizationId, productId, req.user.userId, stageId, body);
  }

  @Post('crm/pipelines/:pipelineId/stages/reorder')
  reorderStages(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('pipelineId') pipelineId: string, @Body() body: ReorderCrmStagesDto) {
    return this.pipelineService.reorderStages(organizationId, productId, req.user.userId, pipelineId, body);
  }

  @Get('crm/pipelines/:pipelineId/board')
  board(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('pipelineId') pipelineId: string) {
    return this.opportunityService.board(organizationId, productId, req.user.userId, pipelineId);
  }

  @Post('leads/:leadId/convert-to-opportunity')
  convertLead(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('leadId') leadId: string, @Body() body: ConvertLeadToOpportunityDto) {
    return this.opportunityService.convertLead(organizationId, productId, req.user.userId, leadId, body);
  }

  @Post('crm/opportunities')
  createOpportunity(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Body() body: CreateCrmOpportunityDto) {
    return this.opportunityService.create(organizationId, productId, req.user.userId, body);
  }

  @Post('crm/accounts')
  createAccount(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Body() body: CreateCrmAccountDto) {
    return this.accountService.create(organizationId, productId, req.user.userId, body);
  }

  @Get('crm/accounts')
  listAccounts(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: Record<string, string | undefined>) {
    return this.accountService.list(organizationId, productId, req.user.userId, query);
  }

  @Get('crm/accounts/suggestions/leads/:leadId')
  suggestAccountsForLead(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('leadId') leadId: string) {
    return this.accountService.suggestionsForLead(organizationId, productId, req.user.userId, leadId);
  }

  @Post('crm/accounts/export-opportunities')
  exportCrmOpportunities(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Body() body: ExportCrmOpportunitiesDto) {
    return this.accountService.exportOpportunities(organizationId, productId, req.user.userId, body);
  }

  @Get('crm/data-health')
  dataHealth(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.dataHealthService.getDataHealth(organizationId, productId, req.user.userId);
  }

  @Get('crm/accounts/:accountId')
  getAccount(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('accountId') accountId: string) {
    return this.accountService.get(organizationId, productId, req.user.userId, accountId);
  }

  @Patch('crm/accounts/:accountId')
  updateAccount(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('accountId') accountId: string, @Body() body: UpdateCrmAccountDto) {
    return this.accountService.update(organizationId, productId, req.user.userId, accountId, body);
  }

  @Post('crm/accounts/:accountId/archive')
  archiveAccount(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('accountId') accountId: string) {
    return this.accountService.archive(organizationId, productId, req.user.userId, accountId);
  }

  @Post('crm/accounts/:accountId/leads/:leadId/link')
  linkLeadToAccount(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('accountId') accountId: string, @Param('leadId') leadId: string) {
    return this.accountService.linkLead(organizationId, productId, req.user.userId, accountId, leadId);
  }

  @Post('crm/accounts/:accountId/leads/:leadId/unlink')
  unlinkLeadFromAccount(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('accountId') accountId: string, @Param('leadId') leadId: string) {
    return this.accountService.unlinkLead(organizationId, productId, req.user.userId, accountId, leadId);
  }

  @Get('crm/opportunities')
  listOpportunities(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.opportunityService.list(organizationId, productId, req.user.userId, query);
  }

  @Get('crm/opportunities/:opportunityId')
  getOpportunity(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('opportunityId') opportunityId: string) {
    return this.opportunityService.get(organizationId, productId, req.user.userId, opportunityId);
  }

  @Patch('crm/opportunities/:opportunityId')
  updateOpportunity(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('opportunityId') opportunityId: string, @Body() body: UpdateCrmOpportunityDto) {
    return this.opportunityService.update(organizationId, productId, req.user.userId, opportunityId, body);
  }

  @Post('crm/opportunities/:opportunityId/move-stage')
  moveOpportunity(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('opportunityId') opportunityId: string, @Body() body: MoveCrmOpportunityStageDto) {
    return this.opportunityService.moveStage(organizationId, productId, req.user.userId, opportunityId, body);
  }

  @Post('crm/opportunities/:opportunityId/mark-won')
  markWon(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('opportunityId') opportunityId: string) {
    return this.opportunityService.markWon(organizationId, productId, req.user.userId, opportunityId);
  }

  @Post('crm/opportunities/:opportunityId/mark-lost')
  markLost(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('opportunityId') opportunityId: string, @Body() body: { lostReason?: string }) {
    return this.opportunityService.markLost(organizationId, productId, req.user.userId, opportunityId, body);
  }

  @Post('crm/opportunities/:opportunityId/notes')
  addNote(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('opportunityId') opportunityId: string, @Body() body: AddCrmOpportunityNoteDto) {
    return this.opportunityService.addNote(organizationId, productId, req.user.userId, opportunityId, body);
  }

  @Post('crm/opportunities/:opportunityId/activities')
  logActivity(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('opportunityId') opportunityId: string, @Body() body: LogCrmActivityDto) {
    return this.opportunityService.logActivity(organizationId, productId, req.user.userId, opportunityId, body);
  }

  @Post('crm/opportunities/:opportunityId/follow-ups')
  createFollowUp(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('opportunityId') opportunityId: string, @Body() body: CreateCrmFollowUpDto) {
    return this.followUpService.create(organizationId, productId, req.user.userId, opportunityId, body);
  }

  @Get('crm/follow-ups')
  listFollowUps(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: Record<string, string | undefined>) {
    return this.followUpService.list(organizationId, productId, req.user.userId, query);
  }

  @Get('crm/follow-ups/:followUpId')
  getFollowUp(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('followUpId') followUpId: string) {
    return this.followUpService.get(organizationId, productId, req.user.userId, followUpId);
  }

  @Patch('crm/follow-ups/:followUpId')
  updateFollowUp(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('followUpId') followUpId: string, @Body() body: UpdateCrmFollowUpDto) {
    return this.followUpService.update(organizationId, productId, req.user.userId, followUpId, body);
  }

  @Post('crm/follow-ups/:followUpId/complete')
  completeFollowUp(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('followUpId') followUpId: string, @Body() body: CompleteCrmFollowUpDto) {
    return this.followUpService.complete(organizationId, productId, req.user.userId, followUpId, body);
  }

  @Post('crm/follow-ups/:followUpId/cancel')
  cancelFollowUp(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('followUpId') followUpId: string) {
    return this.followUpService.cancel(organizationId, productId, req.user.userId, followUpId);
  }

  @Post('crm/follow-ups/:followUpId/reopen')
  reopenFollowUp(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('followUpId') followUpId: string) {
    return this.followUpService.reopen(organizationId, productId, req.user.userId, followUpId);
  }

  @Get('crm/dashboard')
  dashboard(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: Record<string, string | undefined>) {
    return this.dashboardService.getDashboard(organizationId, productId, req.user.userId, query);
  }
}
