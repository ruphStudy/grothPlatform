import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LearningQueryDto } from './dto/learning.dto';
import { LearningService } from './services/learning.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/learning')
export class LearningController {
  constructor(private readonly learningService: LearningService) {}

  @Post('aggregate')
  aggregate(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: LearningQueryDto) {
    return this.learningService.aggregate(organizationId, productId, req.user.userId, query);
  }

  @Get('dashboard')
  dashboard(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: LearningQueryDto) {
    return this.learningService.dashboard(organizationId, productId, req.user.userId, query);
  }

  @Get('observations')
  observations(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: LearningQueryDto) {
    return this.learningService.observations(organizationId, productId, req.user.userId, query);
  }

  @Get('winning-content')
  winningContent(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: LearningQueryDto) {
    return this.learningService.winningContent(organizationId, productId, req.user.userId, query);
  }

  @Get('winning-channels')
  winningChannels(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: LearningQueryDto) {
    return this.learningService.winningChannels(organizationId, productId, req.user.userId, query);
  }

  @Get('ctas')
  ctas(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: LearningQueryDto) {
    return this.learningService.ctas(organizationId, productId, req.user.userId, query);
  }

  @Get('topics')
  topics(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: LearningQueryDto) {
    return this.learningService.topics(organizationId, productId, req.user.userId, query);
  }

  @Get('prompt-suggestions')
  promptSuggestions(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: LearningQueryDto) {
    return this.learningService.promptSuggestions(organizationId, productId, req.user.userId, query);
  }

  @Post('prompt-suggestions/:recommendationId/status')
  updatePromptSuggestion(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('recommendationId') recommendationId: string, @Body() body: { status: 'accepted' | 'rejected' }) {
    return this.learningService.updatePromptSuggestion(organizationId, productId, req.user.userId, recommendationId, body.status);
  }

  @Get('strategy-adjustments')
  strategyAdjustments(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: LearningQueryDto) {
    return this.learningService.strategyAdjustments(organizationId, productId, req.user.userId, query);
  }

  @Get('strategy-adjustments/sprint27-context')
  sprint27Context(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.learningService.sprint27Context(organizationId, productId, req.user.userId);
  }

  @Post('strategy-adjustments/:proposalId/status')
  updateStrategyAdjustment(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('proposalId') proposalId: string, @Body() body: { status: 'accepted' | 'rejected' }) {
    return this.learningService.updateStrategyAdjustment(organizationId, productId, req.user.userId, proposalId, body.status);
  }
}
