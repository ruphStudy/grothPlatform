import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BulkLeadStatusDto, ExportLeadsCsvDto, ImportLeadsCsvDto, ManualLeadDto, UpdateLeadDto } from './dto/lead-common.dto';
import { LeadDashboardService } from './services/lead-dashboard.service';
import { LeadsService } from './services/leads.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService, private readonly dashboardService: LeadDashboardService) {}

  @Get()
  list(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Query('status') status?: string,
    @Query('campaignId') campaignId?: string,
    @Query('sourceType') sourceType?: string,
    @Query('search') search?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('latestCapturedFrom') latestCapturedFrom?: string,
    @Query('latestCapturedTo') latestCapturedTo?: string,
    @Query('qualificationStatus') qualificationStatus?: string,
    @Query('grade') grade?: string,
    @Query('communicationEligibility') communicationEligibility?: string,
    @Query('consentStatus') consentStatus?: string,
    @Query('hasEmail') hasEmail?: string,
    @Query('hasPhone') hasPhone?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
  ) {
    return this.leadsService.list(organizationId, productId, req.user.userId, {
      status,
      campaignId,
      sourceType,
      search,
      createdFrom,
      createdTo,
      latestCapturedFrom,
      latestCapturedTo,
      qualificationStatus,
      grade,
      communicationEligibility,
      consentStatus,
      hasEmail,
      hasPhone,
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined,
      sort,
      order,
    });
  }

  @Get('identity-conflicts')
  listIdentityConflicts(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
  ) {
    return this.leadsService.listIdentityConflicts(organizationId, productId, req.user.userId);
  }

  @Get('dashboard')
  dashboard(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('range') range?: string,
    @Query('timezone') timezone?: string,
  ) {
    return this.dashboardService.getDashboard(organizationId, productId, req.user.userId, { from, to, range, timezone });
  }

  @Patch('identity-conflicts/:conflictId/reviewed')
  markIdentityConflictReviewed(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('conflictId') conflictId: string,
  ) {
    return this.leadsService.markIdentityConflictReviewed(organizationId, productId, req.user.userId, conflictId);
  }

  @Post('manual')
  manualCreate(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Body() body: ManualLeadDto,
  ) {
    return this.leadsService.manualCreate(organizationId, productId, req.user.userId, body);
  }

  @Patch('bulk-status')
  bulkStatus(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Body() body: BulkLeadStatusDto,
  ) {
    return this.leadsService.bulkStatus(organizationId, productId, req.user.userId, body);
  }

  @Post('import-csv')
  importCsv(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Body() body: ImportLeadsCsvDto,
  ) {
    return this.leadsService.importCsv(organizationId, productId, req.user.userId, body);
  }

  @Post('export-csv')
  exportCsv(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Body() body: ExportLeadsCsvDto,
  ) {
    return this.leadsService.exportCsv(organizationId, productId, req.user.userId, body);
  }

  @Get(':leadId')
  get(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('leadId') leadId: string,
  ) {
    return this.leadsService.get(organizationId, productId, req.user.userId, leadId);
  }

  @Patch(':leadId')
  update(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('leadId') leadId: string,
    @Body() body: UpdateLeadDto,
  ) {
    return this.leadsService.update(organizationId, productId, req.user.userId, leadId, body);
  }

  @Post(':leadId/recalculate-qualification')
  recalculateQualification(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('leadId') leadId: string,
  ) {
    return this.leadsService.recalculateQualification(organizationId, productId, req.user.userId, leadId);
  }
}
