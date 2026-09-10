import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { LeadIdentityConflict, LeadIdentityConflictDocument } from '../../leads/schemas/lead-identity-conflict.schema';
import { LeadQualification, LeadQualificationDocument } from '../../leads/schemas/lead-qualification.schema';
import { Lead, LeadDocument } from '../../leads/schemas/lead.schema';
import { ProductsService } from '../../products/products.service';
import { AudiencePreviewDto, CreateEmailCampaignDto } from '../dto/email.dto';
import { EmailCampaign, EmailCampaignDocument } from '../schemas/email-campaign.schema';
import { EmailCampaignRecipient, EmailCampaignRecipientDocument } from '../schemas/email-campaign-recipient.schema';
import { EmailConnection, EmailConnectionDocument } from '../schemas/email-connection.schema';
import { EmailSender, EmailSenderDocument } from '../schemas/email-sender.schema';
import { EmailSuppression, EmailSuppressionDocument } from '../schemas/email-suppression.schema';
import { EmailUnsubscribeToken, EmailUnsubscribeTokenDocument } from '../schemas/email-unsubscribe-token.schema';
import type { EmailAudienceDefinition, EmailSkipReason } from '../types/email.types';
import { EmailService } from './email.service';
import { EmailTemplateRendererService } from './email-template-renderer.service';
import { EmailTemplateService } from './email-template.service';

const MAX_AUDIENCE = Number(process.env.EMAIL_BROADCAST_MAX_RECIPIENTS || 10000);
const BATCH_SIZE = Number(process.env.EMAIL_BROADCAST_BATCH_SIZE || 25);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class EmailCampaignService {
  constructor(
    @InjectModel(EmailCampaign.name) private readonly campaignModel: Model<EmailCampaignDocument>,
    @InjectModel(EmailCampaignRecipient.name) private readonly recipientModel: Model<EmailCampaignRecipientDocument>,
    @InjectModel(EmailSuppression.name) private readonly suppressionModel: Model<EmailSuppressionDocument>,
    @InjectModel(EmailUnsubscribeToken.name) private readonly unsubscribeTokenModel: Model<EmailUnsubscribeTokenDocument>,
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(LeadQualification.name) private readonly qualificationModel: Model<LeadQualificationDocument>,
    @InjectModel(LeadIdentityConflict.name) private readonly conflictModel: Model<LeadIdentityConflictDocument>,
    @InjectModel(EmailSender.name) private readonly senderModel: Model<EmailSenderDocument>,
    @InjectModel(EmailConnection.name) private readonly connectionModel: Model<EmailConnectionDocument>,
    private readonly productsService: ProductsService,
    private readonly templateService: EmailTemplateService,
    private readonly renderer: EmailTemplateRendererService,
    private readonly emailService: EmailService,
  ) {}

  async create(organizationId: string, productId: string, userId: string, dto: CreateEmailCampaignDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const template = await this.templateService.findTemplate(organizationId, productId, dto.templateId);
    const version = dto.templateVersion || template.latestVersion;
    await this.templateService.findVersion(organizationId, productId, dto.templateId, version);
    await this.assertVerifiedSender(organizationId, productId, dto.senderId);
    const preview = await this.previewAudience(organizationId, productId, userId, { audienceDefinition: dto.audienceDefinition, templateId: dto.templateId, templateVersion: version });
    const campaign = await new this.campaignModel({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), campaignId: dto.campaignId ? new Types.ObjectId(dto.campaignId) : undefined, name: dto.name.trim(), emailTemplateId: template._id, emailTemplateVersion: version, senderId: new Types.ObjectId(dto.senderId), subjectOverride: dto.subjectOverride?.trim(), audienceDefinition: this.cleanAudience(dto.audienceDefinition), status: 'ready', recipientCount: preview.eligible, acceptedCount: 0, failedCount: 0, skippedCount: preview.matched - preview.eligible, createdByUserId: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined }).save();
    return this.toCampaignResponse(campaign);
  }

  async list(organizationId: string, productId: string, userId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const items = await this.campaignModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).sort({ createdAt: -1 }).limit(100).exec();
    return items.map((item) => this.toCampaignResponse(item));
  }

  async get(organizationId: string, productId: string, userId: string, campaignId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const campaign = await this.findCampaign(organizationId, productId, campaignId);
    const recipients = await this.recipientModel.find({ organizationId: campaign.organizationId, productId: campaign.productId, emailCampaignId: campaign._id }).sort({ createdAt: -1 }).limit(100).exec();
    return { ...this.toCampaignResponse(campaign), recipients: recipients.map((item) => this.toRecipientResponse(item)) };
  }

  async audiencePreview(organizationId: string, productId: string, userId: string, dto: AudiencePreviewDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    return this.previewAudience(organizationId, productId, userId, dto);
  }

  async send(organizationId: string, productId: string, userId: string, emailCampaignId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const campaign = await this.findCampaign(organizationId, productId, emailCampaignId);
    if (!['ready', 'draft'].includes(campaign.status)) throw new BadRequestException('email_campaign_invalid_state');
    const sender = await this.assertVerifiedSender(organizationId, productId, campaign.senderId.toString());
    campaign.status = 'sending';
    campaign.startedAt = new Date();
    await campaign.save();
    let recipients: any[] = await this.recipientModel.find({ organizationId: campaign.organizationId, productId: campaign.productId, emailCampaignId: campaign._id }).exec();
    if (!recipients.length) recipients = await this.freezeRecipients(organizationId, productId, userId, campaign);
    const pending = recipients.filter((item) => item.status === 'pending').slice(0, BATCH_SIZE);
    for (const recipient of pending) await this.sendRecipient(organizationId, productId, userId, campaign, sender, recipient);
    await this.updateCounts(campaign);
    return this.get(organizationId, productId, userId, emailCampaignId);
  }

  async cancel(organizationId: string, productId: string, userId: string, emailCampaignId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const campaign = await this.findCampaign(organizationId, productId, emailCampaignId);
    if (!['draft', 'ready'].includes(campaign.status)) throw new BadRequestException('email_campaign_invalid_state');
    campaign.status = 'cancelled';
    campaign.completedAt = new Date();
    await campaign.save();
    return this.toCampaignResponse(campaign);
  }

  async unsubscribe(token: string) {
    const doc = await this.unsubscribeTokenModel.findOne({ tokenHash: this.tokenHash(token) }).exec();
    if (!doc) return { status: 'ok' };
    await this.suppressionModel.updateOne({ organizationId: doc.organizationId, productId: doc.productId, normalizedEmail: doc.normalizedEmail }, { $set: { reason: 'unsubscribed', active: true, source: 'public_unsubscribe' } }, { upsert: true }).exec();
    await this.leadModel.updateOne({ _id: doc.leadId, organizationId: doc.organizationId, productId: doc.productId }, { consentStatus: 'denied' }).exec();
    doc.usedAt = new Date();
    await doc.save();
    return { status: 'unsubscribed' };
  }

  private async previewAudience(organizationId: string, productId: string, userId: string, dto: AudiencePreviewDto) {
    const leads = await this.resolveLeads(organizationId, productId, dto.audienceDefinition);
    const [qualifications, conflicts, suppressions] = await Promise.all([
      this.qualificationMap(organizationId, productId, leads.map((lead) => lead._id)),
      this.conflictedLeadIds(organizationId, productId),
      this.suppressionSet(organizationId, productId, leads.map((lead) => this.normalizedEmail(lead))),
    ]);
    let matched = leads.length, eligible = 0, restricted = 0, unknown = 0, missingEmail = 0, archived = 0, identityConflict = 0, suppressed = 0, otherSkipped = 0;
    const sampleRecipients: any[] = [];
    for (const lead of leads) {
      const skip = this.skipReason(lead, qualifications.get(lead._id.toString()), conflicts, suppressions);
      if (skip === 'archived') archived++;
      else if (skip === 'no_email' || skip === 'invalid_email') missingEmail++;
      else if (skip === 'identity_conflict') identityConflict++;
      else if (skip === 'suppressed' || skip === 'unsubscribed') suppressed++;
      else if (skip === 'communication_restricted') restricted++;
      else if (skip === 'communication_unknown') unknown++;
      else if (skip) otherSkipped++;
      else {
        eligible++;
        if (sampleRecipients.length < 10) sampleRecipients.push({ leadId: lead._id.toString(), displayName: lead.fullName || lead.email || 'Lead', email: lead.normalizedEmail || lead.email, communicationEligibility: qualifications.get(lead._id.toString())?.communicationEligibility });
      }
    }
    if (dto.templateId && sampleRecipients.length) {
      const version = await this.templateService.findVersion(organizationId, productId, dto.templateId, dto.templateVersion || (await this.templateService.findTemplate(organizationId, productId, dto.templateId)).latestVersion);
      const first = leads.find((lead) => lead._id.toString() === sampleRecipients[0].leadId)!;
      const rendered = this.renderer.render(version, { firstName: first.firstName, lastName: first.lastName, fullName: first.fullName, email: first.normalizedEmail || first.email, companyName: first.companyName, jobTitle: first.jobTitle, unsubscribeUrl: 'https://example.test/unsubscribe/sample' });
      return { matched, eligible, restricted, unknown, missingEmail, archived, identityConflict, suppressed, otherSkipped, sampleRecipients, samplePreview: rendered };
    }
    return { matched, eligible, restricted, unknown, missingEmail, archived, identityConflict, suppressed, otherSkipped, sampleRecipients };
  }

  private async freezeRecipients(organizationId: string, productId: string, userId: string, campaign: EmailCampaignDocument) {
    const leads = await this.resolveLeads(organizationId, productId, campaign.audienceDefinition ?? {});
    const [qualifications, conflicts, suppressions] = await Promise.all([
      this.qualificationMap(organizationId, productId, leads.map((lead) => lead._id)),
      this.conflictedLeadIds(organizationId, productId),
      this.suppressionSet(organizationId, productId, leads.map((lead) => this.normalizedEmail(lead))),
    ]);
    const docs: EmailCampaignRecipientDocument[] = [];
    for (const lead of leads) {
      const email = this.normalizedEmail(lead);
      const skipReason = this.skipReason(lead, qualifications.get(lead._id.toString()), conflicts, suppressions);
      docs.push(await new this.recipientModel({ organizationId: campaign.organizationId, productId: campaign.productId, emailCampaignId: campaign._id, leadId: lead._id, normalizedEmail: email || 'missing', status: skipReason ? 'skipped' : 'pending', skipReason, idempotencyKey: `email-campaign:${campaign._id}:lead:${lead._id}` }).save());
    }
    await this.updateCounts(campaign);
    return docs;
  }

  private async sendRecipient(organizationId: string, productId: string, userId: string, campaign: EmailCampaignDocument, sender: EmailSenderDocument, recipient: EmailCampaignRecipientDocument) {
    recipient.status = 'sending';
    await recipient.save();
    try {
      const unsubscribeUrl = await this.unsubscribeUrl(campaign, recipient);
      const rendered = await this.templateService.renderForSend(organizationId, productId, userId, campaign.emailTemplateId.toString(), campaign.emailTemplateVersion, { leadId: recipient.leadId.toString(), senderId: sender._id.toString(), campaignId: campaign.campaignId?.toString(), unsubscribeUrl });
      const html = rendered.html && rendered.html.includes(unsubscribeUrl) ? rendered.html : rendered.html ? `${rendered.html}<p><a href="${unsubscribeUrl}">Unsubscribe</a></p>` : undefined;
      const text = rendered.text && rendered.text.includes(unsubscribeUrl) ? rendered.text : rendered.text ? `${rendered.text}\n\nUnsubscribe: ${unsubscribeUrl}` : `Unsubscribe: ${unsubscribeUrl}`;
      const message = await this.emailService.send({ organizationId, productId, connectionId: sender.emailConnectionId.toString(), senderId: sender._id.toString(), recipient: { email: recipient.normalizedEmail }, purpose: 'marketing', subject: campaign.subjectOverride || rendered.subject, html, text, idempotencyKey: recipient.idempotencyKey, createdByUserId: userId, leadId: recipient.leadId.toString(), campaignId: campaign.campaignId?.toString(), emailCampaignId: campaign._id.toString(), templateId: campaign.emailTemplateId.toString(), templateVersion: campaign.emailTemplateVersion, sendReason: 'future_campaign' });
      recipient.emailMessageId = new Types.ObjectId(message.id);
      recipient.providerMessageId = message.providerMessageId;
      recipient.status = message.status === 'accepted' ? 'accepted' : 'failed';
      if (message.status !== 'accepted') recipient.skipReason = 'other';
    } catch {
      recipient.status = 'failed';
      recipient.skipReason = 'other';
    }
    await recipient.save();
  }

  private async updateCounts(campaign: EmailCampaignDocument) {
    const counts = await this.recipientModel.aggregate([{ $match: { organizationId: campaign.organizationId, productId: campaign.productId, emailCampaignId: campaign._id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]).exec();
    const map = new Map(counts.map((item) => [item._id, item.count]));
    campaign.recipientCount = counts.reduce((sum, item) => sum + item.count, 0);
    campaign.acceptedCount = map.get('accepted') ?? 0;
    campaign.failedCount = map.get('failed') ?? 0;
    campaign.skippedCount = map.get('skipped') ?? 0;
    const active = (map.get('pending') ?? 0) + (map.get('sending') ?? 0);
    if (campaign.status === 'sending' && active === 0) {
      campaign.status = campaign.failedCount ? 'partially_failed' : 'completed';
      campaign.completedAt = new Date();
    }
    await campaign.save();
  }

  private async resolveLeads(organizationId: string, productId: string, audience: EmailAudienceDefinition) {
    const query: Record<string, any> = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) };
    if (audience.leadIds?.length) query._id = { $in: audience.leadIds.map((id) => new Types.ObjectId(id)) };
    if (audience.statuses?.length) query.status = { $in: audience.statuses };
    if (audience.campaignIds?.length) query.campaignId = { $in: audience.campaignIds.map((id) => new Types.ObjectId(id)) };
    if (audience.sourceTypes?.length) query.sourceType = { $in: audience.sourceTypes };
    if (audience.consentStatuses?.length) query.consentStatus = { $in: audience.consentStatuses };
    let leads = await this.leadModel.find(query).sort({ latestCapturedAt: -1 }).limit(MAX_AUDIENCE).exec();
    if (audience.grades?.length || audience.qualificationStatuses?.length || audience.communicationEligibility?.length) {
      const q: Record<string, any> = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), leadId: { $in: leads.map((lead) => lead._id) } };
      if (audience.grades?.length) q.grade = { $in: audience.grades };
      if (audience.qualificationStatuses?.length) q.qualificationStatus = { $in: audience.qualificationStatuses };
      if (audience.communicationEligibility?.length) q.communicationEligibility = { $in: audience.communicationEligibility };
      const allowed = new Set((await this.qualificationModel.find(q, { leadId: 1 }).exec()).map((item) => item.leadId.toString()));
      leads = leads.filter((lead) => allowed.has(lead._id.toString()));
    }
    return leads;
  }

  private skipReason(lead: LeadDocument, qualification: LeadQualificationDocument | undefined, conflicts: Set<string>, suppressions: Set<string>): EmailSkipReason | undefined {
    const email = this.normalizedEmail(lead);
    if (lead.status === 'archived') return 'archived';
    if (!email) return 'no_email';
    if (!EMAIL_RE.test(email)) return 'invalid_email';
    if (conflicts.has(lead._id.toString())) return 'identity_conflict';
    if (suppressions.has(email)) return 'suppressed';
    const eligibility = qualification?.communicationEligibility ?? (lead.consentStatus === 'granted' ? 'allowed' : lead.consentStatus === 'denied' ? 'restricted' : 'unknown');
    if (eligibility === 'restricted') return 'communication_restricted';
    if (eligibility !== 'allowed') return 'communication_unknown';
    return undefined;
  }

  private async assertVerifiedSender(organizationId: string, productId: string, senderId: string) {
    const sender = await this.senderModel.findOne({ _id: new Types.ObjectId(senderId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (!sender || sender.status !== 'verified') throw new BadRequestException('email_sender_unverified');
    const connection = await this.connectionModel.findOne({ _id: sender.emailConnectionId, organizationId: sender.organizationId, productId: sender.productId }).exec();
    if (!connection || connection.status !== 'active') throw new BadRequestException('email_connection_invalid');
    return sender;
  }

  private async unsubscribeUrl(campaign: EmailCampaignDocument, recipient: EmailCampaignRecipientDocument) {
    const token = randomBytes(32).toString('base64url');
    await new this.unsubscribeTokenModel({ organizationId: campaign.organizationId, productId: campaign.productId, leadId: recipient.leadId, normalizedEmail: recipient.normalizedEmail, tokenHash: this.tokenHash(token) }).save();
    const base = process.env.APP_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
    return `${base}/public/email/unsubscribe/${token}`;
  }

  private tokenHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private normalizedEmail(lead: LeadDocument) {
    return (lead.normalizedEmail || lead.email || '').trim().toLowerCase();
  }

  private async qualificationMap(organizationId: string, productId: string, ids: Types.ObjectId[]) {
    const docs = ids.length ? await this.qualificationModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), leadId: { $in: ids } }).exec() : [];
    return new Map(docs.map((doc) => [doc.leadId.toString(), doc]));
  }

  private async conflictedLeadIds(organizationId: string, productId: string) {
    const conflicts = await this.conflictModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), status: 'unresolved' }).limit(1000).exec();
    return new Set(conflicts.flatMap((conflict) => [conflict.emailLeadId.toString(), conflict.phoneLeadId.toString()]));
  }

  private async suppressionSet(organizationId: string, productId: string, emails: string[]) {
    const docs = emails.length ? await this.suppressionModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), normalizedEmail: { $in: emails.filter(Boolean) }, active: true }).exec() : [];
    return new Set(docs.map((doc) => doc.normalizedEmail));
  }

  private cleanAudience(audience: EmailAudienceDefinition) {
    const allowed = ['statuses', 'qualificationStatuses', 'grades', 'campaignIds', 'sourceTypes', 'consentStatuses', 'communicationEligibility', 'leadIds'];
    return Object.fromEntries(Object.entries(audience ?? {}).filter(([key, value]) => allowed.includes(key) && Array.isArray(value)));
  }

  private async findCampaign(organizationId: string, productId: string, campaignId: string) {
    if (!Types.ObjectId.isValid(campaignId)) throw new NotFoundException('email_campaign_not_found');
    const campaign = await this.campaignModel.findOne({ _id: new Types.ObjectId(campaignId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (!campaign) throw new NotFoundException('email_campaign_not_found');
    return campaign;
  }

  private toCampaignResponse(campaign: EmailCampaignDocument) {
    return { id: campaign._id.toString(), organizationId: campaign.organizationId.toString(), productId: campaign.productId.toString(), campaignId: campaign.campaignId?.toString(), name: campaign.name, emailTemplateId: campaign.emailTemplateId.toString(), emailTemplateVersion: campaign.emailTemplateVersion, senderId: campaign.senderId.toString(), subjectOverride: campaign.subjectOverride, status: campaign.status, audienceDefinition: campaign.audienceDefinition, recipientCount: campaign.recipientCount ?? 0, acceptedCount: campaign.acceptedCount ?? 0, failedCount: campaign.failedCount ?? 0, skippedCount: campaign.skippedCount ?? 0, startedAt: campaign.startedAt, completedAt: campaign.completedAt, createdByUserId: campaign.createdByUserId?.toString(), createdAt: campaign.createdAt, updatedAt: campaign.updatedAt };
  }

  private toRecipientResponse(recipient: EmailCampaignRecipientDocument) {
    return { id: recipient._id.toString(), emailCampaignId: recipient.emailCampaignId.toString(), leadId: recipient.leadId.toString(), normalizedEmail: recipient.normalizedEmail, status: recipient.status, skipReason: recipient.skipReason, emailMessageId: recipient.emailMessageId?.toString(), providerMessageId: recipient.providerMessageId, createdAt: recipient.createdAt, updatedAt: recipient.updatedAt };
  }
}
