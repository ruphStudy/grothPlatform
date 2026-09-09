import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AddCrmOpportunityNoteDto, ConvertLeadToOpportunityDto, CreateCrmOpportunityDto, CreateCrmPipelineDto, CreateCrmStageDto, MoveCrmOpportunityStageDto, ReorderCrmStagesDto, UpdateCrmOpportunityDto, UpdateCrmPipelineDto, UpdateCrmStageDto } from './dto/crm.dto';
import { CrmOpportunityService } from './services/crm-opportunity.service';
import { CrmPipelineService } from './services/crm-pipeline.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId')
export class CrmController {
  constructor(private readonly pipelineService: CrmPipelineService, private readonly opportunityService: CrmOpportunityService) {}

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
}
