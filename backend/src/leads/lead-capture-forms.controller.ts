import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateLeadCaptureFormDto, PublicLeadCaptureFormSubmissionDto, UpdateLeadCaptureFormDto } from './dto/lead-capture-form.dto';
import { LeadCaptureFormsService } from './services/lead-capture-forms.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/lead-forms')
export class LeadCaptureFormsController {
  constructor(private readonly formsService: LeadCaptureFormsService) {}

  @Post()
  create(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Body() body: CreateLeadCaptureFormDto) {
    return this.formsService.create(organizationId, productId, req.user.userId, body);
  }

  @Get()
  list(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.formsService.list(organizationId, productId, req.user.userId);
  }

  @Get(':formId')
  get(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('formId') formId: string) {
    return this.formsService.get(organizationId, productId, req.user.userId, formId);
  }

  @Patch(':formId')
  update(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('formId') formId: string, @Body() body: UpdateLeadCaptureFormDto) {
    return this.formsService.update(organizationId, productId, req.user.userId, formId, body);
  }

  @Post(':formId/activate')
  activate(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('formId') formId: string) {
    return this.formsService.activate(organizationId, productId, req.user.userId, formId);
  }

  @Post(':formId/deactivate')
  deactivate(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('formId') formId: string) {
    return this.formsService.deactivate(organizationId, productId, req.user.userId, formId);
  }

  @Post(':formId/rotate-key')
  rotatePublicKey(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('formId') formId: string) {
    return this.formsService.rotatePublicKey(organizationId, productId, req.user.userId, formId);
  }
}

@Controller('public/lead-forms')
export class PublicLeadCaptureFormsController {
  constructor(private readonly formsService: LeadCaptureFormsService) {}

  @Get(':publicKey')
  config(@Param('publicKey') publicKey: string) {
    return this.formsService.publicConfig(publicKey);
  }

  @Post(':publicKey/submit')
  submit(@Param('publicKey') publicKey: string, @Body() body: PublicLeadCaptureFormSubmissionDto, @Req() req: { headers: Record<string, string | string[] | undefined>; ip?: string }) {
    const headerValue = (name: string) => {
      const value = req.headers[name];
      return Array.isArray(value) ? value[0] : value;
    };
    return this.formsService.publicSubmit(publicKey, body, {
      origin: headerValue('origin'),
      ip: headerValue('x-forwarded-for') ?? req.ip,
      idempotencyKey: headerValue('idempotency-key'),
    });
  }
}
