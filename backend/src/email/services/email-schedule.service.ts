import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CrmActivity, CrmActivityDocument } from '../../crm/schemas/crm-activity.schema';
import { CrmFollowUp, CrmFollowUpDocument } from '../../crm/schemas/crm-follow-up.schema';
import { LeadIdentityConflict, LeadIdentityConflictDocument } from '../../leads/schemas/lead-identity-conflict.schema';
import { LeadQualification, LeadQualificationDocument } from '../../leads/schemas/lead-qualification.schema';
import { Lead, LeadDocument } from '../../leads/schemas/lead.schema';
import { ProductsService } from '../../products/products.service';
import { CreateEmailScheduleDto, UpdateEmailScheduleDto } from '../dto/email.dto';
import { EmailConnection, EmailConnectionDocument } from '../schemas/email-connection.schema';
import { EmailSchedule, EmailScheduleDocument } from '../schemas/email-schedule.schema';
import { EmailSender, EmailSenderDocument } from '../schemas/email-sender.schema';
import { EmailSuppression, EmailSuppressionDocument } from '../schemas/email-suppression.schema';
import { EmailService } from './email.service';
import { EmailTemplateService } from './email-template.service';

const BATCH_SIZE = Number(process.env.EMAIL_SCHEDULE_BATCH_SIZE || 25);
const LOCK_MS = Number(process.env.EMAIL_SCHEDULE_LOCK_MS || 10 * 60 * 1000);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class EmailScheduleService {
  private readonly workerId = `email-schedule-${process.pid}`;

  constructor(
    @InjectModel(EmailSchedule.name) private readonly scheduleModel: Model<EmailScheduleDocument>,
    @InjectModel(EmailSender.name) private readonly senderModel: Model<EmailSenderDocument>,
    @InjectModel(EmailConnection.name) private readonly connectionModel: Model<EmailConnectionDocument>,
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(LeadQualification.name) private readonly qualificationModel: Model<LeadQualificationDocument>,
    @InjectModel(LeadIdentityConflict.name) private readonly conflictModel: Model<LeadIdentityConflictDocument>,
    @InjectModel(EmailSuppression.name) private readonly suppressionModel: Model<EmailSuppressionDocument>,
    @InjectModel(CrmFollowUp.name) private readonly followUpModel: Model<CrmFollowUpDocument>,
    @InjectModel(CrmActivity.name) private readonly activityModel: Model<CrmActivityDocument>,
    private readonly productsService: ProductsService,
    private readonly templateService: EmailTemplateService,
    private readonly emailService: EmailService,
  ) {}

  async create(organizationId: string, productId: string, userId: string, dto: CreateEmailScheduleDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const existing = await this.scheduleModel.findOne({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), idempotencyKey: dto.idempotencyKey }).exec();
    if (existing) return this.toResponse(existing);
    const sender = await this.assertSender(organizationId, productId, dto.senderId);
    const lead = await this.assertLeadEligible(organizationId, productId, dto.leadId);
    const template = await this.templateService.findTemplate(organizationId, productId, dto.templateId);
    const version = dto.templateVersion || template.latestVersion;
    await this.templateService.findVersion(organizationId, productId, dto.templateId, version);
    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) throw new BadRequestException('email_schedule_time_invalid');
    const schedule = await new this.scheduleModel({ organizationId: sender.organizationId, productId: sender.productId, leadId: lead._id, opportunityId: dto.opportunityId ? new Types.ObjectId(dto.opportunityId) : undefined, campaignId: dto.campaignId ? new Types.ObjectId(dto.campaignId) : undefined, senderId: sender._id, templateId: template._id, templateVersion: version, scheduledAt, timezone: dto.timezone, status: 'scheduled', idempotencyKey: dto.idempotencyKey, createdByUserId: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined }).save();
    return this.toResponse(schedule);
  }

  async list(organizationId: string, productId: string, userId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const items = await this.scheduleModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).sort({ scheduledAt: -1 }).limit(100).exec();
    return items.map((item) => this.toResponse(item));
  }

  async update(organizationId: string, productId: string, userId: string, scheduleId: string, dto: UpdateEmailScheduleDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const schedule = await this.findSchedule(organizationId, productId, scheduleId);
    if (schedule.status !== 'scheduled') throw new BadRequestException('email_schedule_invalid_state');
    if (dto.senderId) {
      await this.assertSender(organizationId, productId, dto.senderId);
      schedule.senderId = new Types.ObjectId(dto.senderId);
    }
    if (dto.templateId) {
      const template = await this.templateService.findTemplate(organizationId, productId, dto.templateId);
      schedule.templateId = template._id;
      schedule.templateVersion = dto.templateVersion || template.latestVersion;
    } else if (dto.templateVersion) schedule.templateVersion = dto.templateVersion;
    if (dto.scheduledAt) {
      const scheduledAt = new Date(dto.scheduledAt);
      if (Number.isNaN(scheduledAt.getTime())) throw new BadRequestException('email_schedule_time_invalid');
      schedule.scheduledAt = scheduledAt;
    }
    if (dto.timezone !== undefined) schedule.timezone = dto.timezone;
    await this.templateService.findVersion(organizationId, productId, schedule.templateId.toString(), schedule.templateVersion);
    await schedule.save();
    return this.toResponse(schedule);
  }

  async cancel(organizationId: string, productId: string, userId: string, scheduleId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const schedule = await this.findSchedule(organizationId, productId, scheduleId);
    if (schedule.status !== 'scheduled') throw new BadRequestException('email_schedule_invalid_state');
    schedule.status = 'cancelled';
    await schedule.save();
    return this.toResponse(schedule);
  }

  async sendFollowUp(organizationId: string, productId: string, userId: string, followUpId: string, dto: { senderId: string; templateId: string; templateVersion?: number; markCompleted?: boolean }) {
    await this.productsService.findOne(organizationId, productId, userId);
    const followUp = await this.followUpModel.findOne({ _id: new Types.ObjectId(followUpId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (!followUp || followUp.type !== 'email') throw new BadRequestException('crm_follow_up_invalid');
    const sender = await this.assertSender(organizationId, productId, dto.senderId);
    const lead = await this.assertLeadEligible(organizationId, productId, followUp.leadId.toString());
    const template = await this.templateService.findTemplate(organizationId, productId, dto.templateId);
    const version = dto.templateVersion || template.latestVersion;
    const rendered = await this.templateService.renderForSend(organizationId, productId, userId, dto.templateId, version, { leadId: lead._id.toString(), opportunityId: followUp.opportunityId.toString(), senderId: sender._id.toString() });
    const message = await this.emailService.send({ organizationId, productId, connectionId: sender.emailConnectionId.toString(), senderId: sender._id.toString(), recipient: { email: lead.normalizedEmail || lead.email || '' }, purpose: 'manual_crm', subject: rendered.subject, html: rendered.html, text: rendered.text, idempotencyKey: `crm-follow-up:${followUp._id}:email:${dto.templateId}:v${version}`, createdByUserId: userId, leadId: lead._id.toString(), opportunityId: followUp.opportunityId.toString(), templateId: dto.templateId, templateVersion: version, sendReason: 'crm_follow_up' });
    await new this.activityModel({ organizationId: followUp.organizationId, productId: followUp.productId, opportunityId: followUp.opportunityId, leadId: followUp.leadId, type: 'note_added', note: 'Follow-up email sent.', metadata: { followUpId: followUp._id.toString(), emailMessageId: message.id }, actorUserId: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined }).save();
    if (dto.markCompleted && message.status === 'accepted' && followUp.status === 'pending') {
      followUp.status = 'completed';
      followUp.completedAt = new Date();
      followUp.outcome = 'Email accepted by provider';
      await followUp.save();
    }
    return message;
  }

  async processDue() {
    const processed: any[] = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      const item = await this.claimDueSchedule();
      if (!item) break;
      processed.push(await this.executeSchedule(item));
    }
    return { processed: processed.length, items: processed };
  }

  private async claimDueSchedule() {
    const stale = new Date(Date.now() - LOCK_MS);
    return this.scheduleModel.findOneAndUpdate(
      { status: 'scheduled', scheduledAt: { $lte: new Date() }, $or: [{ lockedAt: { $exists: false } }, { lockedAt: { $lt: stale } }] },
      { $set: { status: 'processing', lockedAt: new Date(), lockedBy: this.workerId } },
      { sort: { scheduledAt: 1 }, new: true },
    ).exec();
  }

  private async executeSchedule(schedule: EmailScheduleDocument) {
    try {
      const sender = await this.assertSender(schedule.organizationId.toString(), schedule.productId.toString(), schedule.senderId.toString());
      const lead = await this.assertLeadEligible(schedule.organizationId.toString(), schedule.productId.toString(), schedule.leadId.toString());
      const rendered = await this.templateService.renderForSend(schedule.organizationId.toString(), schedule.productId.toString(), schedule.createdByUserId?.toString() || '', schedule.templateId.toString(), schedule.templateVersion, { leadId: lead._id.toString(), opportunityId: schedule.opportunityId?.toString(), campaignId: schedule.campaignId?.toString(), senderId: sender._id.toString() });
      const message = await this.emailService.send({ organizationId: schedule.organizationId.toString(), productId: schedule.productId.toString(), connectionId: sender.emailConnectionId.toString(), senderId: sender._id.toString(), recipient: { email: lead.normalizedEmail || lead.email || '' }, purpose: 'manual_crm', subject: rendered.subject, html: rendered.html, text: rendered.text, idempotencyKey: schedule.idempotencyKey, createdByUserId: schedule.createdByUserId?.toString(), leadId: lead._id.toString(), opportunityId: schedule.opportunityId?.toString(), campaignId: schedule.campaignId?.toString(), emailScheduleId: schedule._id.toString(), templateId: schedule.templateId.toString(), templateVersion: schedule.templateVersion, sendReason: 'manual' });
      schedule.emailMessageId = new Types.ObjectId(message.id);
      schedule.status = message.status === 'accepted' ? 'accepted' : 'failed';
    } catch {
      schedule.status = 'failed';
    }
    schedule.lockedAt = undefined;
    schedule.lockedBy = undefined;
    await schedule.save();
    return this.toResponse(schedule);
  }

  private async assertSender(organizationId: string, productId: string, senderId: string) {
    const sender = await this.senderModel.findOne({ _id: new Types.ObjectId(senderId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), status: 'verified' }).exec();
    if (!sender) throw new BadRequestException('email_sender_unverified');
    const connection = await this.connectionModel.findOne({ _id: sender.emailConnectionId, organizationId: sender.organizationId, productId: sender.productId, status: 'active' }).exec();
    if (!connection) throw new BadRequestException('email_connection_invalid');
    return sender;
  }

  private async assertLeadEligible(organizationId: string, productId: string, leadId: string) {
    const lead = await this.leadModel.findOne({ _id: new Types.ObjectId(leadId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (!lead || lead.status === 'archived') throw new BadRequestException('email_lead_ineligible');
    const email = (lead.normalizedEmail || lead.email || '').trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) throw new BadRequestException('email_recipient_invalid');
    const [qualification, conflict, suppression] = await Promise.all([
      this.qualificationModel.findOne({ organizationId: lead.organizationId, productId: lead.productId, leadId: lead._id }).exec(),
      this.conflictModel.exists({ organizationId: lead.organizationId, productId: lead.productId, status: 'unresolved', $or: [{ emailLeadId: lead._id }, { phoneLeadId: lead._id }] }),
      this.suppressionModel.exists({ organizationId: lead.organizationId, productId: lead.productId, normalizedEmail: email, active: true }),
    ]);
    if (conflict || suppression) throw new BadRequestException('email_lead_ineligible');
    const eligibility = qualification?.communicationEligibility ?? (lead.consentStatus === 'granted' ? 'allowed' : lead.consentStatus === 'denied' ? 'restricted' : 'unknown');
    if (eligibility === 'restricted') throw new BadRequestException('email_lead_ineligible');
    return lead;
  }

  private async findSchedule(organizationId: string, productId: string, scheduleId: string) {
    if (!Types.ObjectId.isValid(scheduleId)) throw new NotFoundException('email_schedule_not_found');
    const doc = await this.scheduleModel.findOne({ _id: new Types.ObjectId(scheduleId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (!doc) throw new NotFoundException('email_schedule_not_found');
    return doc;
  }

  private toResponse(item: EmailScheduleDocument) {
    return { id: item._id.toString(), organizationId: item.organizationId.toString(), productId: item.productId.toString(), leadId: item.leadId.toString(), opportunityId: item.opportunityId?.toString(), campaignId: item.campaignId?.toString(), senderId: item.senderId.toString(), templateId: item.templateId.toString(), templateVersion: item.templateVersion, scheduledAt: item.scheduledAt, timezone: item.timezone, status: item.status, idempotencyKey: item.idempotencyKey, emailMessageId: item.emailMessageId?.toString(), createdByUserId: item.createdByUserId?.toString(), createdAt: item.createdAt, updatedAt: item.updatedAt };
  }
}
