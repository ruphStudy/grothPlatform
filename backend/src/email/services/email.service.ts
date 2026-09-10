import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model, Types } from 'mongoose';
import { ProductsService } from '../../products/products.service';
import { EmailCredentialEncryptionService } from '../connections/email-credential-encryption.service';
import { CreateEmailConnectionDto, CreateEmailSenderDto, TestEmailSendDto, UpdateEmailCredentialDto } from '../dto/email.dto';
import { EmailEngineService } from '../engine/email-engine.service';
import { EmailInputError, EmailProviderError } from '../errors/email.errors';
import { EmailConnection, EmailConnectionDocument } from '../schemas/email-connection.schema';
import { EmailMessage, EmailMessageDocument } from '../schemas/email-message.schema';
import { EmailSender, EmailSenderDocument } from '../schemas/email-sender.schema';
import type { EmailBodyType, EmailCredential, EmailSenderStatusResult } from '../types/email.types';
import { EmailCommunicationPolicyService } from './email-communication-policy.service';

const MAX_RECIPIENTS = Number(process.env.EMAIL_SINGLE_SEND_MAX_RECIPIENTS || 1);
const MAX_SUBJECT = Number(process.env.EMAIL_MAX_SUBJECT_LENGTH || 200);
const MAX_HTML_BYTES = Number(process.env.EMAIL_MAX_HTML_BYTES || 500000);
const MAX_TEXT_BYTES = Number(process.env.EMAIL_MAX_TEXT_BYTES || 200000);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class EmailService {
  constructor(
    @InjectModel(EmailConnection.name) private readonly connectionModel: Model<EmailConnectionDocument>,
    @InjectModel(EmailSender.name) private readonly senderModel: Model<EmailSenderDocument>,
    @InjectModel(EmailMessage.name) private readonly messageModel: Model<EmailMessageDocument>,
    private readonly productsService: ProductsService,
    private readonly encryption: EmailCredentialEncryptionService,
    private readonly engine: EmailEngineService,
    private readonly policy: EmailCommunicationPolicyService,
  ) {}

  async createConnection(organizationId: string, productId: string, userId: string, dto: CreateEmailConnectionDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const credential = this.parseCredential(dto.credential);
    const capabilities = this.engine.capabilities(dto.platform);
    const validation = await this.engine.validateConnection(dto.platform, credential);
    const connection = await new this.connectionModel({
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      platform: dto.platform,
      name: dto.name.trim(),
      encryptedCredential: this.encryption.encrypt(JSON.stringify(credential)),
      status: validation.status,
      capabilities,
      lastValidatedAt: new Date(),
      errorCode: validation.errorCode,
    }).save();
    return this.toConnectionResponse(connection);
  }

  async listConnections(organizationId: string, productId: string, userId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const items = await this.connectionModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).sort({ createdAt: -1 }).exec();
    return items.map((item) => this.toConnectionResponse(item));
  }

  async validateConnection(organizationId: string, productId: string, userId: string, connectionId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const connection = await this.findConnection(organizationId, productId, connectionId);
    const validation = await this.engine.validateConnection(connection.platform, this.decrypt(connection));
    connection.status = validation.status;
    connection.errorCode = validation.errorCode;
    connection.lastValidatedAt = new Date();
    await connection.save();
    return this.toConnectionResponse(connection);
  }

  async updateCredential(organizationId: string, productId: string, userId: string, connectionId: string, dto: UpdateEmailCredentialDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const connection = await this.findConnection(organizationId, productId, connectionId);
    const credential = this.parseCredential(dto.credential);
    const validation = await this.engine.validateConnection(connection.platform, credential);
    connection.encryptedCredential = this.encryption.encrypt(JSON.stringify(credential));
    connection.status = validation.status;
    connection.errorCode = validation.errorCode;
    connection.lastValidatedAt = new Date();
    await connection.save();
    return this.toConnectionResponse(connection);
  }

  async disableConnection(organizationId: string, productId: string, userId: string, connectionId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const connection = await this.findConnection(organizationId, productId, connectionId);
    connection.status = 'disabled';
    await connection.save();
    return this.toConnectionResponse(connection);
  }

  async createSender(organizationId: string, productId: string, userId: string, dto: CreateEmailSenderDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const connection = await this.findConnection(organizationId, productId, dto.connectionId);
    const email = this.normalizeEmail(dto.email);
    const domain = email.split('@')[1];
    let statusResult: EmailSenderStatusResult = { status: 'pending' };
    if (connection.capabilities.domainVerification) statusResult = await this.engine.registerDomain(connection.platform, { credential: this.decrypt(connection), domain });
    const sender = await new this.senderModel({
      organizationId: connection.organizationId,
      productId: connection.productId,
      emailConnectionId: connection._id,
      email,
      name: dto.name?.trim(),
      domain,
      type: dto.type || 'email',
      status: statusResult.status === 'verified' ? 'verified' : statusResult.status === 'failed' ? 'failed' : 'pending',
      providerDomainId: statusResult.providerDomainId,
      verificationDetails: statusResult.verificationDetails,
      lastCheckedAt: new Date(),
    }).save();
    return this.toSenderResponse(sender, connection);
  }

  async listSenders(organizationId: string, productId: string, userId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const [senders, connections] = await Promise.all([
      this.senderModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).sort({ createdAt: -1 }).exec(),
      this.connectionModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec(),
    ]);
    const connectionMap = new Map(connections.map((item) => [item._id.toString(), item]));
    return senders.map((sender) => this.toSenderResponse(sender, connectionMap.get(sender.emailConnectionId.toString())));
  }

  async getSender(organizationId: string, productId: string, userId: string, senderId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const sender = await this.findSender(organizationId, productId, senderId);
    const connection = await this.findConnection(organizationId, productId, sender.emailConnectionId.toString());
    return this.toSenderResponse(sender, connection);
  }

  async checkSender(organizationId: string, productId: string, userId: string, senderId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const sender = await this.findSender(organizationId, productId, senderId);
    const connection = await this.findConnection(organizationId, productId, sender.emailConnectionId.toString());
    const result = await this.engine.getSenderStatus(connection.platform, { credential: this.decrypt(connection), email: sender.email, domain: sender.domain, providerDomainId: sender.providerDomainId });
    sender.status = result.status === 'verified' ? 'verified' : result.status === 'failed' ? 'failed' : 'pending';
    sender.providerDomainId = result.providerDomainId || sender.providerDomainId;
    sender.verificationDetails = result.verificationDetails;
    sender.lastCheckedAt = new Date();
    await sender.save();
    return this.toSenderResponse(sender, connection);
  }

  async disableSender(organizationId: string, productId: string, userId: string, senderId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const sender = await this.findSender(organizationId, productId, senderId);
    sender.status = 'disabled';
    sender.isDefault = false;
    await sender.save();
    return this.toSenderResponse(sender);
  }

  async setDefaultSender(organizationId: string, productId: string, userId: string, senderId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const sender = await this.findSender(organizationId, productId, senderId);
    if (sender.status !== 'verified') throw new BadRequestException('email_sender_unverified');
    await this.senderModel.updateMany({ organizationId: sender.organizationId, productId: sender.productId }, { isDefault: false }).exec();
    sender.isDefault = true;
    await sender.save();
    return this.toSenderResponse(sender);
  }

  async sendTest(organizationId: string, productId: string, userId: string, dto: TestEmailSendDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    return this.send({
      organizationId,
      productId,
      connectionId: dto.connectionId,
      senderId: dto.senderId,
      recipient: { email: dto.recipientEmail, name: dto.recipientName },
      purpose: dto.purpose || 'manual_crm',
      subject: dto.subject,
      html: dto.html,
      text: dto.text,
      replyTo: dto.replyTo,
      idempotencyKey: dto.idempotencyKey,
      createdByUserId: userId,
      sendReason: 'manual',
    });
  }

  async send(input: { organizationId: string; productId: string; connectionId: string; senderId: string; recipient: { email: string; name?: string }; purpose: 'manual_crm' | 'marketing'; subject: string; html?: string; text?: string; replyTo?: string; idempotencyKey: string; createdByUserId?: string; leadId?: string; opportunityId?: string; campaignId?: string; sendReason: 'manual' | 'crm_follow_up' | 'future_campaign' | 'future_sequence' }) {
    this.validateSendInput(input);
    await this.policy.assertAllowedForLead({ organizationId: input.organizationId, productId: input.productId, leadId: input.leadId, purpose: input.purpose });
    const payloadHash = this.hashPayload(input);
    const existing = await this.messageModel.findOne({ organizationId: new Types.ObjectId(input.organizationId), productId: new Types.ObjectId(input.productId), idempotencyKey: input.idempotencyKey }).exec();
    if (existing) {
      if (existing.payloadHash !== payloadHash) throw new ConflictException('email_idempotency_conflict');
      return this.toMessageResponse(existing);
    }
    const [connection, sender] = await Promise.all([
      this.findConnection(input.organizationId, input.productId, input.connectionId),
      this.findSender(input.organizationId, input.productId, input.senderId),
    ]);
    if (!sender.emailConnectionId.equals(connection._id)) throw new BadRequestException('email_connection_invalid');
    if (connection.status !== 'active') throw new BadRequestException('email_connection_invalid');
    if (sender.status !== 'verified') throw new BadRequestException('email_sender_unverified');
    const message = await new this.messageModel({
      organizationId: connection.organizationId,
      productId: connection.productId,
      leadId: input.leadId ? new Types.ObjectId(input.leadId) : undefined,
      opportunityId: input.opportunityId ? new Types.ObjectId(input.opportunityId) : undefined,
      campaignId: input.campaignId ? new Types.ObjectId(input.campaignId) : undefined,
      emailConnectionId: connection._id,
      emailSenderId: sender._id,
      provider: connection.platform,
      fromEmail: sender.email,
      fromName: sender.name,
      toEmail: this.normalizeEmail(input.recipient.email),
      toName: input.recipient.name,
      replyTo: input.replyTo,
      subject: input.subject.trim(),
      bodyType: this.bodyType(input.html, input.text),
      htmlSnapshot: input.html,
      textSnapshot: input.text,
      status: 'pending',
      sendReason: input.sendReason,
      idempotencyKey: input.idempotencyKey,
      payloadHash,
      createdByUserId: input.createdByUserId && Types.ObjectId.isValid(input.createdByUserId) ? new Types.ObjectId(input.createdByUserId) : undefined,
    }).save();
    message.status = 'sending';
    await message.save();
    try {
      const result = await this.engine.send(connection.platform, this.decrypt(connection), {
        from: { email: sender.email, name: sender.name },
        to: [{ email: message.toEmail, name: message.toName }],
        replyTo: input.replyTo,
        subject: message.subject,
        html: input.html,
        text: input.text,
        metadata: { emailMessageId: message._id.toString(), productId: input.productId },
      });
      message.providerMessageId = result.providerMessageId;
      message.status = 'accepted';
      message.acceptedAt = result.acceptedAt;
    } catch (err) {
      message.status = 'failed';
      message.errorCode = err instanceof EmailProviderError ? err.code : err instanceof EmailInputError ? String(err.message) : 'email_send_failed';
      message.failedAt = new Date();
    }
    await message.save();
    return this.toMessageResponse(message);
  }

  async listMessages(organizationId: string, productId: string, userId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const items = await this.messageModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).sort({ createdAt: -1 }).limit(50).exec();
    return items.map((item) => this.toMessageResponse(item));
  }

  private async findConnection(organizationId: string, productId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('email_connection_invalid');
    const doc = await this.connectionModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (!doc) throw new NotFoundException('email_connection_invalid');
    return doc;
  }

  private async findSender(organizationId: string, productId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('email_sender_unverified');
    const doc = await this.senderModel.findOne({ _id: new Types.ObjectId(id), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (!doc) throw new NotFoundException('email_sender_unverified');
    return doc;
  }

  private decrypt(connection: EmailConnectionDocument): EmailCredential {
    return JSON.parse(this.encryption.decrypt(connection.encryptedCredential));
  }

  private parseCredential(value: { apiKey?: string }): EmailCredential {
    if (!value?.apiKey?.trim()) throw new BadRequestException('email_connection_invalid');
    return { apiKey: value.apiKey.trim() };
  }

  private validateSendInput(input: { recipient: { email: string }; subject: string; html?: string; text?: string; replyTo?: string }) {
    if (MAX_RECIPIENTS < 1) throw new BadRequestException('email_recipient_invalid');
    this.normalizeEmail(input.recipient.email);
    if (input.replyTo) this.normalizeEmail(input.replyTo);
    this.noHeaderInjection(input.subject, 'email_subject_invalid');
    if (!input.subject.trim() || input.subject.length > MAX_SUBJECT) throw new BadRequestException('email_subject_invalid');
    if (!input.html && !input.text) throw new BadRequestException('email_content_invalid');
    if (input.html && (Buffer.byteLength(input.html, 'utf8') > MAX_HTML_BYTES || /<script[\s>]/i.test(input.html) || /javascript:/i.test(input.html))) throw new BadRequestException('email_content_invalid');
    if (input.text && Buffer.byteLength(input.text, 'utf8') > MAX_TEXT_BYTES) throw new BadRequestException('email_content_invalid');
  }

  private normalizeEmail(value: string) {
    this.noHeaderInjection(value, 'email_recipient_invalid');
    const email = value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new BadRequestException('email_recipient_invalid');
    return email;
  }

  private noHeaderInjection(value: string, code: string) {
    if (/[\r\n]/.test(value)) throw new BadRequestException(code);
  }

  private bodyType(html?: string, text?: string): EmailBodyType {
    return html && text ? 'both' : html ? 'html' : 'text';
  }

  private hashPayload(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private toConnectionResponse(connection: EmailConnectionDocument) {
    return { id: connection._id.toString(), organizationId: connection.organizationId.toString(), productId: connection.productId.toString(), platform: connection.platform, name: connection.name, status: connection.status, capabilities: connection.capabilities, lastValidatedAt: connection.lastValidatedAt, errorCode: connection.errorCode, createdAt: connection.createdAt, updatedAt: connection.updatedAt };
  }

  private toSenderResponse(sender: EmailSenderDocument, connection?: EmailConnectionDocument) {
    return { id: sender._id.toString(), organizationId: sender.organizationId.toString(), productId: sender.productId.toString(), emailConnectionId: sender.emailConnectionId.toString(), platform: connection?.platform, email: sender.email, name: sender.name, domain: sender.domain, type: sender.type, status: sender.status, providerSenderId: sender.providerSenderId, providerDomainId: sender.providerDomainId, verificationDetails: sender.verificationDetails, lastCheckedAt: sender.lastCheckedAt, isDefault: Boolean(sender.isDefault), createdAt: sender.createdAt, updatedAt: sender.updatedAt };
  }

  private toMessageResponse(message: EmailMessageDocument) {
    return { id: message._id.toString(), organizationId: message.organizationId.toString(), productId: message.productId.toString(), leadId: message.leadId?.toString(), opportunityId: message.opportunityId?.toString(), campaignId: message.campaignId?.toString(), emailConnectionId: message.emailConnectionId.toString(), emailSenderId: message.emailSenderId.toString(), provider: message.provider, providerMessageId: message.providerMessageId, fromEmail: message.fromEmail, fromName: message.fromName, toEmail: message.toEmail, toName: message.toName, replyTo: message.replyTo, subject: message.subject, bodyType: message.bodyType, status: message.status, sendReason: message.sendReason, errorCode: message.errorCode, acceptedAt: message.acceptedAt, failedAt: message.failedAt, createdAt: message.createdAt, updatedAt: message.updatedAt };
  }
}
