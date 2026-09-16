import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PERMISSIONS } from '../team/schemas/team.schema';
import { AuthorizationService } from '../team/services/team.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditLogService } from './services/audit-log.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/audit-logs')
export class AuditController {
  constructor(
    private readonly audit: AuditLogService,
    private readonly authz: AuthorizationService,
  ) {}

  @Get()
  async list(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Query() query: AuditLogQueryDto) {
    await this.authz.assertPermission(organizationId, req.user.userId, PERMISSIONS.AUDIT_VIEW);
    return this.audit.query(organizationId, query);
  }
}
