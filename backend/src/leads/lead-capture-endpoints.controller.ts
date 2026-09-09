import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateLeadCaptureEndpointDto, UpdateLeadCaptureEndpointDto } from './dto/lead-capture-endpoint.dto';
import { PublicLeadCaptureDto } from './dto/lead-common.dto';
import { LeadCaptureEndpointsService } from './services/lead-capture-endpoints.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/lead-capture-endpoints')
export class LeadCaptureEndpointsController {
  constructor(private readonly endpointsService: LeadCaptureEndpointsService) {}

  @Post()
  create(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Body() body: CreateLeadCaptureEndpointDto,
  ) {
    return this.endpointsService.create(organizationId, productId, req.user.userId, body);
  }

  @Get()
  list(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.endpointsService.list(organizationId, productId, req.user.userId);
  }

  @Patch(':endpointId')
  update(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('endpointId') endpointId: string,
    @Body() body: UpdateLeadCaptureEndpointDto,
  ) {
    return this.endpointsService.update(organizationId, productId, req.user.userId, endpointId, body);
  }

  @Post(':endpointId/rotate-key')
  rotateKey(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('endpointId') endpointId: string,
  ) {
    return this.endpointsService.rotateKey(organizationId, productId, req.user.userId, endpointId);
  }

  @Post(':endpointId/disable')
  disable(
    @Req() req: { user: { userId: string } },
    @Param('organizationId') organizationId: string,
    @Param('productId') productId: string,
    @Param('endpointId') endpointId: string,
  ) {
    return this.endpointsService.disable(organizationId, productId, req.user.userId, endpointId);
  }
}

@Controller('public/leads')
export class PublicLeadCaptureController {
  constructor(private readonly endpointsService: LeadCaptureEndpointsService) {}

  @Post(':publicKey')
  capture(
    @Param('publicKey') publicKey: string,
    @Body() body: PublicLeadCaptureDto,
    @Req() req: { headers: Record<string, string | string[] | undefined>; ip?: string },
  ) {
    const headerValue = (name: string) => {
      const value = req.headers[name];
      return Array.isArray(value) ? value[0] : value;
    };
    return this.endpointsService.publicCapture(publicKey, body, {
      origin: headerValue('origin'),
      ip: headerValue('x-forwarded-for') ?? req.ip,
      idempotencyKey: headerValue('idempotency-key'),
    });
  }
}
