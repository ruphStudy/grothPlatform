import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AudiencePreviewDto, CreateEmailCampaignDto, CreateEmailConnectionDto, CreateEmailSenderDto, CreateEmailTemplateDto, PreviewEmailTemplateDto, TestEmailSendDto, UpdateEmailCredentialDto, UpdateEmailTemplateDto } from './dto/email.dto';
import { EmailCampaignService } from './services/email-campaign.service';
import { EmailService } from './services/email.service';
import { EmailTemplateService } from './services/email-template.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/email')
export class EmailController {
  constructor(private readonly emailService: EmailService, private readonly templateService: EmailTemplateService, private readonly campaignService: EmailCampaignService) {}

  @Post('connections')
  createConnection(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Body() body: CreateEmailConnectionDto) {
    return this.emailService.createConnection(organizationId, productId, req.user.userId, body);
  }

  @Get('connections')
  listConnections(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.emailService.listConnections(organizationId, productId, req.user.userId);
  }

  @Post('connections/:connectionId/validate')
  validateConnection(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('connectionId') connectionId: string) {
    return this.emailService.validateConnection(organizationId, productId, req.user.userId, connectionId);
  }

  @Patch('connections/:connectionId/credential')
  updateCredential(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('connectionId') connectionId: string, @Body() body: UpdateEmailCredentialDto) {
    return this.emailService.updateCredential(organizationId, productId, req.user.userId, connectionId, body);
  }

  @Post('connections/:connectionId/disable')
  disableConnection(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('connectionId') connectionId: string) {
    return this.emailService.disableConnection(organizationId, productId, req.user.userId, connectionId);
  }

  @Post('senders')
  createSender(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Body() body: CreateEmailSenderDto) {
    return this.emailService.createSender(organizationId, productId, req.user.userId, body);
  }

  @Get('senders')
  listSenders(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.emailService.listSenders(organizationId, productId, req.user.userId);
  }

  @Get('senders/:senderId')
  getSender(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('senderId') senderId: string) {
    return this.emailService.getSender(organizationId, productId, req.user.userId, senderId);
  }

  @Post('senders/:senderId/check-verification')
  checkSender(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('senderId') senderId: string) {
    return this.emailService.checkSender(organizationId, productId, req.user.userId, senderId);
  }

  @Post('senders/:senderId/disable')
  disableSender(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('senderId') senderId: string) {
    return this.emailService.disableSender(organizationId, productId, req.user.userId, senderId);
  }

  @Post('senders/:senderId/set-default')
  setDefaultSender(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('senderId') senderId: string) {
    return this.emailService.setDefaultSender(organizationId, productId, req.user.userId, senderId);
  }

  @Post('test-send')
  testSend(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Body() body: TestEmailSendDto) {
    return this.emailService.sendTest(organizationId, productId, req.user.userId, body);
  }

  @Get('messages')
  listMessages(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.emailService.listMessages(organizationId, productId, req.user.userId);
  }

  @Post('templates')
  createTemplate(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Body() body: CreateEmailTemplateDto) {
    return this.templateService.create(organizationId, productId, req.user.userId, body);
  }

  @Get('templates')
  listTemplates(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.templateService.list(organizationId, productId, req.user.userId, {});
  }

  @Get('templates/:templateId')
  getTemplate(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('templateId') templateId: string) {
    return this.templateService.get(organizationId, productId, req.user.userId, templateId);
  }

  @Patch('templates/:templateId')
  updateTemplate(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('templateId') templateId: string, @Body() body: UpdateEmailTemplateDto) {
    return this.templateService.update(organizationId, productId, req.user.userId, templateId, body);
  }

  @Post('templates/:templateId/archive')
  archiveTemplate(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('templateId') templateId: string) {
    return this.templateService.archive(organizationId, productId, req.user.userId, templateId);
  }

  @Get('templates/:templateId/versions')
  templateVersions(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('templateId') templateId: string) {
    return this.templateService.versions(organizationId, productId, req.user.userId, templateId);
  }

  @Get('templates/:templateId/versions/:version')
  templateVersion(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('templateId') templateId: string, @Param('version') version: string) {
    return this.templateService.version(organizationId, productId, req.user.userId, templateId, Number(version));
  }

  @Post('templates/:templateId/versions/:version/preview')
  previewTemplate(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('templateId') templateId: string, @Param('version') version: string, @Body() body: PreviewEmailTemplateDto) {
    return this.templateService.preview(organizationId, productId, req.user.userId, templateId, Number(version), body);
  }

  @Post('campaigns/audience-preview')
  audiencePreview(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Body() body: AudiencePreviewDto) {
    return this.campaignService.audiencePreview(organizationId, productId, req.user.userId, body);
  }

  @Post('campaigns')
  createCampaign(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Body() body: CreateEmailCampaignDto) {
    return this.campaignService.create(organizationId, productId, req.user.userId, body);
  }

  @Get('campaigns')
  listCampaigns(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string) {
    return this.campaignService.list(organizationId, productId, req.user.userId);
  }

  @Get('campaigns/:emailCampaignId')
  getCampaign(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('emailCampaignId') emailCampaignId: string) {
    return this.campaignService.get(organizationId, productId, req.user.userId, emailCampaignId);
  }

  @Post('campaigns/:emailCampaignId/send')
  sendCampaign(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('emailCampaignId') emailCampaignId: string) {
    return this.campaignService.send(organizationId, productId, req.user.userId, emailCampaignId);
  }

  @Post('campaigns/:emailCampaignId/cancel')
  cancelCampaign(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('productId') productId: string, @Param('emailCampaignId') emailCampaignId: string) {
    return this.campaignService.cancel(organizationId, productId, req.user.userId, emailCampaignId);
  }
}

@Controller('public/email')
export class PublicEmailController {
  constructor(private readonly campaignService: EmailCampaignService) {}

  @Get('unsubscribe/:token')
  unsubscribeGet(@Param('token') token: string) {
    return this.campaignService.unsubscribe(token);
  }

  @Post('unsubscribe/:token')
  unsubscribePost(@Param('token') token: string) {
    return this.campaignService.unsubscribe(token);
  }
}
