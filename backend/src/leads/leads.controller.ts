import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ManualLeadDto, UpdateLeadDto } from './dto/lead-common.dto';
import { LeadsService } from './services/leads.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

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
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('sort') sort?: string,
  ) {
    return this.leadsService.list(organizationId, productId, req.user.userId, {
      status,
      campaignId,
      sourceType,
      search,
      createdFrom,
      createdTo,
      limit: limit ? Number(limit) : undefined,
      page: page ? Number(page) : undefined,
      sort,
    });
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
}
