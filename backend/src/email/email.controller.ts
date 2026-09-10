import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateEmailConnectionDto, CreateEmailSenderDto, TestEmailSendDto, UpdateEmailCredentialDto } from './dto/email.dto';
import { EmailService } from './services/email.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId/products/:productId/email')
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

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
}
