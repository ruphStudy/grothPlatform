import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GrowthBrainQueryDto, GrowthBrainRunDto, GrowthResourceConstraintsDto } from './dto/growth-brain.dto';
import { GrowthBrainReadService, GrowthDecisionEngineService } from './services/growth-brain.services';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/growth-brain')
export class GrowthBrainController {
  constructor(
    private readonly engine: GrowthDecisionEngineService,
    private readonly reads: GrowthBrainReadService,
  ) {}

  @Post('run')
  run(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Body() dto: GrowthBrainRunDto) {
    return this.engine.run(organizationId, productId, req.user.userId, dto);
  }

  @Get('dashboard')
  dashboard(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.reads.dashboard(organizationId, productId, req.user.userId);
  }

  @Get('opportunities')
  opportunities(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: GrowthBrainQueryDto) {
    return this.reads.opportunities(organizationId, productId, req.user.userId, query);
  }

  @Get('allocation')
  allocation(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.reads.allocationPlan(organizationId, productId, req.user.userId);
  }

  @Patch('resource-constraints')
  updateConstraints(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Body() dto: GrowthResourceConstraintsDto) {
    return this.reads.updateConstraints(organizationId, productId, req.user.userId, dto);
  }

  @Get('channels')
  channels(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.reads.channelPriorities(organizationId, productId, req.user.userId);
  }

  @Get('content-priorities')
  contentPriorities(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.reads.contentPriorities(organizationId, productId, req.user.userId);
  }

  @Post('weekly-plan/generate')
  generateWeeklyPlan(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.reads.generateWeeklyPlan(organizationId, productId, req.user.userId);
  }

  @Get('weekly-plan/current')
  currentWeeklyPlan(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.reads.currentWeeklyPlan(organizationId, productId, req.user.userId);
  }

  @Get('weekly-plans')
  weeklyPlans(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.reads.weeklyPlans(organizationId, productId, req.user.userId);
  }

  @Get('weekly-plans/:id')
  weeklyPlan(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('id') id: string) {
    return this.reads.weeklyPlan(organizationId, productId, req.user.userId, id);
  }

  @Get('decisions/:decisionRunId/explanations')
  explanationsForRun(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('decisionRunId') decisionRunId: string) {
    return this.reads.explanationsForRun(organizationId, productId, req.user.userId, decisionRunId);
  }

  @Get('explanations/:id')
  explanation(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('id') id: string) {
    return this.reads.explanation(organizationId, productId, req.user.userId, id);
  }
}
