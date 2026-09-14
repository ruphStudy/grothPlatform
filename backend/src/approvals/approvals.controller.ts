import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApprovalDecisionDto, ApprovalQueueQueryDto, CreateApprovalRequestDto } from './dto/approval.dto';
import { ApprovalWorkflowService } from './services/approval-workflow.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalWorkflowService) {}

  @Post('approvals')
  create(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Body() dto: CreateApprovalRequestDto) {
    return this.approvals.create(organizationId, productId, req.user.userId, dto);
  }

  @Get('approvals/queue')
  queue(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: ApprovalQueueQueryDto) {
    return this.approvals.queue(organizationId, productId, req.user.userId, query);
  }

  @Get('approval-history')
  productHistory(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query() query: ApprovalQueueQueryDto) {
    return this.approvals.productHistory(organizationId, productId, req.user.userId, query);
  }

  @Get('approvals/status')
  status(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Query('targetType') targetType: string, @Query('targetId') targetId: string, @Query('targetVersionId') targetVersionId?: string) {
    return this.approvals.status(organizationId, productId, req.user.userId, targetType, targetId, targetVersionId);
  }

  @Get('approvals/:approvalId')
  detail(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('approvalId') approvalId: string) {
    return this.approvals.detail(organizationId, productId, req.user.userId, approvalId);
  }

  @Post('approvals/:approvalId/approve')
  approve(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('approvalId') approvalId: string, @Body() dto: ApprovalDecisionDto) {
    return this.approvals.approve(organizationId, productId, req.user.userId, approvalId, dto);
  }

  @Post('approvals/:approvalId/reject')
  reject(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('approvalId') approvalId: string, @Body() dto: ApprovalDecisionDto) {
    return this.approvals.reject(organizationId, productId, req.user.userId, approvalId, dto);
  }

  @Post('approvals/:approvalId/request-changes')
  requestChanges(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('approvalId') approvalId: string, @Body() dto: ApprovalDecisionDto) {
    return this.approvals.requestChanges(organizationId, productId, req.user.userId, approvalId, dto);
  }

  @Post('approvals/:approvalId/cancel')
  cancel(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('approvalId') approvalId: string, @Body() dto: ApprovalDecisionDto) {
    return this.approvals.cancel(organizationId, productId, req.user.userId, approvalId, dto);
  }

  @Get('approvals/:approvalId/history')
  history(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('approvalId') approvalId: string) {
    return this.approvals.history(organizationId, productId, req.user.userId, approvalId);
  }
}
