import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CrmOpportunity, CrmOpportunityDocument } from '../../crm/schemas/crm-opportunity.schema';
import { LeadIdentityConflict, LeadIdentityConflictDocument } from '../../leads/schemas/lead-identity-conflict.schema';
import { LeadQualification, LeadQualificationDocument } from '../../leads/schemas/lead-qualification.schema';
import { Lead, LeadDocument } from '../../leads/schemas/lead.schema';
import { ProductsService } from '../../products/products.service';
import { CreateEmailSequenceDto, EmailSequenceStepDto, EnrollEmailSequenceDto, UpdateEmailSequenceDto } from '../dto/email.dto';
import { EmailConnection, EmailConnectionDocument } from '../schemas/email-connection.schema';
import { EmailSender, EmailSenderDocument } from '../schemas/email-sender.schema';
import { EmailSequenceEnrollment, EmailSequenceEnrollmentDocument } from '../schemas/email-sequence-enrollment.schema';
import { EmailSequenceExecution, EmailSequenceExecutionDocument } from '../schemas/email-sequence-execution.schema';
import { EmailSequenceStep, EmailSequenceStepDocument } from '../schemas/email-sequence-step.schema';
import { EmailSequence, EmailSequenceDocument } from '../schemas/email-sequence.schema';
import { EmailSuppression, EmailSuppressionDocument } from '../schemas/email-suppression.schema';
import { EmailUnsubscribeToken, EmailUnsubscribeTokenDocument } from '../schemas/email-unsubscribe-token.schema';
import type { EmailSequenceStopReason } from '../types/email.types';
import { EmailService } from './email.service';
import { EmailTemplateService } from './email-template.service';
import { createHash, randomBytes } from 'crypto';

const MAX_STEPS = Number(process.env.EMAIL_SEQUENCE_MAX_STEPS || 20);
const BATCH_SIZE = Number(process.env.EMAIL_SEQUENCE_BATCH_SIZE || 25);
const LOCK_MS = Number(process.env.EMAIL_SEQUENCE_LOCK_MS || 10 * 60 * 1000);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class EmailSequenceService {
  private readonly workerId = `email-sequence-${process.pid}`;

  constructor(
    @InjectModel(EmailSequence.name) private readonly sequenceModel: Model<EmailSequenceDocument>,
    @InjectModel(EmailSequenceStep.name) private readonly stepModel: Model<EmailSequenceStepDocument>,
    @InjectModel(EmailSequenceEnrollment.name) private readonly enrollmentModel: Model<EmailSequenceEnrollmentDocument>,
    @InjectModel(EmailSequenceExecution.name) private readonly executionModel: Model<EmailSequenceExecutionDocument>,
    @InjectModel(EmailSender.name) private readonly senderModel: Model<EmailSenderDocument>,
    @InjectModel(EmailConnection.name) private readonly connectionModel: Model<EmailConnectionDocument>,
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(LeadQualification.name) private readonly qualificationModel: Model<LeadQualificationDocument>,
    @InjectModel(LeadIdentityConflict.name) private readonly conflictModel: Model<LeadIdentityConflictDocument>,
    @InjectModel(EmailSuppression.name) private readonly suppressionModel: Model<EmailSuppressionDocument>,
    @InjectModel(EmailUnsubscribeToken.name) private readonly unsubscribeTokenModel: Model<EmailUnsubscribeTokenDocument>,
    @InjectModel(CrmOpportunity.name) private readonly opportunityModel: Model<CrmOpportunityDocument>,
    private readonly productsService: ProductsService,
    private readonly templateService: EmailTemplateService,
    private readonly emailService: EmailService,
  ) {}

  async create(organizationId: string, productId: string, userId: string, dto: CreateEmailSequenceDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    await this.assertSender(organizationId, productId, dto.senderId);
    const sequence = await new this.sequenceModel({
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      name: dto.name.trim(),
      campaignId: dto.campaignId ? new Types.ObjectId(dto.campaignId) : undefined,
      senderId: new Types.ObjectId(dto.senderId),
      status: 'draft',
      stopOnReply: false,
      stopOnOpportunityWon: dto.stopOnOpportunityWon ?? true,
      createdByUserId: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined,
    }).save();
    if (dto.steps?.length) await this.replaceSteps(organizationId, productId, sequence, dto.steps);
    return this.get(organizationId, productId, userId, sequence._id.toString());
  }

  async list(organizationId: string, productId: string, userId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const items = await this.sequenceModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).sort({ createdAt: -1 }).limit(100).exec();
    const counts = await this.enrollmentModel.aggregate([{ $match: { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) } }, { $group: { _id: { sequenceId: '$sequenceId', status: '$status' }, count: { $sum: 1 } } }]).exec();
    return Promise.all(items.map(async (item) => this.toSequenceResponse(item, await this.stepModel.countDocuments({ sequenceId: item._id }).exec(), counts)));
  }

  async get(organizationId: string, productId: string, userId: string, sequenceId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const sequence = await this.findSequence(organizationId, productId, sequenceId);
    const [steps, enrollments] = await Promise.all([
      this.stepModel.find({ organizationId: sequence.organizationId, productId: sequence.productId, sequenceId: sequence._id }).sort({ order: 1 }).exec(),
      this.enrollmentModel.find({ organizationId: sequence.organizationId, productId: sequence.productId, sequenceId: sequence._id }).sort({ updatedAt: -1 }).limit(100).exec(),
    ]);
    return { ...(await this.toSequenceResponse(sequence, steps.length, [])), steps: steps.map((step) => this.toStepResponse(step)), enrollments: enrollments.map((item) => this.toEnrollmentResponse(item)) };
  }

  async update(organizationId: string, productId: string, userId: string, sequenceId: string, dto: UpdateEmailSequenceDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const sequence = await this.findSequence(organizationId, productId, sequenceId);
    if (dto.steps && sequence.status === 'active') throw new BadRequestException('email_sequence_pause_before_edit');
    if (dto.name !== undefined) sequence.name = dto.name.trim();
    if (dto.campaignId !== undefined) sequence.campaignId = dto.campaignId ? new Types.ObjectId(dto.campaignId) : undefined;
    if (dto.senderId !== undefined) {
      await this.assertSender(organizationId, productId, dto.senderId);
      sequence.senderId = new Types.ObjectId(dto.senderId);
    }
    if (dto.status !== undefined) {
      if (dto.status === 'active') {
        await this.assertSender(organizationId, productId, sequence.senderId.toString());
        const steps = await this.stepModel.countDocuments({ sequenceId: sequence._id }).exec();
        if (!steps) throw new BadRequestException('email_sequence_steps_required');
      }
      sequence.status = dto.status;
    }
    if (dto.stopOnReply !== undefined) sequence.stopOnReply = false;
    if (dto.stopOnOpportunityWon !== undefined) sequence.stopOnOpportunityWon = dto.stopOnOpportunityWon;
    await sequence.save();
    if (dto.steps) await this.replaceSteps(organizationId, productId, sequence, dto.steps);
    return this.get(organizationId, productId, userId, sequenceId);
  }

  async enroll(organizationId: string, productId: string, userId: string, sequenceId: string, dto: EnrollEmailSequenceDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const sequence = await this.findSequence(organizationId, productId, sequenceId);
    if (sequence.status !== 'active') throw new BadRequestException('email_sequence_not_active');
    const firstStep = await this.stepModel.findOne({ organizationId: sequence.organizationId, productId: sequence.productId, sequenceId: sequence._id }).sort({ order: 1 }).exec();
    if (!firstStep) throw new BadRequestException('email_sequence_steps_required');
    await this.assertSender(organizationId, productId, sequence.senderId.toString());
    const lead = await this.assertLeadEligible(organizationId, productId, dto.leadId);
    if (dto.opportunityId) await this.assertOpportunity(organizationId, productId, dto.opportunityId, dto.leadId);
    const existing = await this.enrollmentModel.findOne({ organizationId: sequence.organizationId, productId: sequence.productId, sequenceId: sequence._id, leadId: new Types.ObjectId(dto.leadId), status: { $in: ['active', 'paused'] } }).exec();
    if (existing) throw new ConflictException('email_sequence_enrollment_exists');
    const startedAt = new Date();
    const enrollment = await new this.enrollmentModel({
      organizationId: sequence.organizationId,
      productId: sequence.productId,
      sequenceId: sequence._id,
      leadId: lead._id,
      opportunityId: dto.opportunityId ? new Types.ObjectId(dto.opportunityId) : undefined,
      campaignId: sequence.campaignId,
      status: 'active',
      currentStepOrder: firstStep.order,
      nextStepAt: this.nextAt(startedAt, firstStep),
      startedAt,
    }).save();
    return this.toEnrollmentResponse(enrollment);
  }

  async stop(organizationId: string, productId: string, userId: string, sequenceId: string, enrollmentId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    await this.findSequence(organizationId, productId, sequenceId);
    const enrollment = await this.enrollmentModel.findOne({ _id: new Types.ObjectId(enrollmentId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), sequenceId: new Types.ObjectId(sequenceId) }).exec();
    if (!enrollment) throw new NotFoundException('email_sequence_enrollment_not_found');
    enrollment.status = 'stopped';
    enrollment.stopReason = 'manual';
    enrollment.stoppedAt = new Date();
    await enrollment.save();
    return this.toEnrollmentResponse(enrollment);
  }

  async processDue() {
    const processed: any[] = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
      const claimed = await this.claimDueEnrollment();
      if (!claimed) break;
      processed.push(await this.processEnrollment(claimed));
    }
    return { processed: processed.length, items: processed };
  }

  private async claimDueEnrollment() {
    const stale = new Date(Date.now() - LOCK_MS);
    return this.enrollmentModel.findOneAndUpdate(
      { status: 'active', nextStepAt: { $lte: new Date() }, $or: [{ lockedAt: { $exists: false } }, { lockedAt: { $lt: stale } }] },
      { $set: { lockedAt: new Date(), lockedBy: this.workerId }, $inc: { attemptCount: 1 } },
      { sort: { nextStepAt: 1 }, new: true },
    ).exec();
  }

  private async processEnrollment(enrollment: EmailSequenceEnrollmentDocument) {
    const sequence = await this.sequenceModel.findOne({ _id: enrollment.sequenceId, organizationId: enrollment.organizationId, productId: enrollment.productId }).exec();
    if (!sequence || sequence.status !== 'active') return this.stopEnrollment(enrollment, 'sequence_paused');
    if (sequence.stopOnOpportunityWon && enrollment.opportunityId) {
      const opportunity = await this.opportunityModel.findOne({ _id: enrollment.opportunityId, organizationId: enrollment.organizationId, productId: enrollment.productId }).exec();
      if (opportunity?.status === 'won') return this.stopEnrollment(enrollment, 'opportunity_won');
    }
    const step = await this.stepModel.findOne({ organizationId: enrollment.organizationId, productId: enrollment.productId, sequenceId: enrollment.sequenceId, order: enrollment.currentStepOrder }).exec();
    if (!step) return this.completeEnrollment(enrollment);
    const execution = await this.executionFor(enrollment, step);
    execution.status = 'processing';
    await execution.save();
    try {
      const lead = await this.assertLeadEligible(enrollment.organizationId.toString(), enrollment.productId.toString(), enrollment.leadId.toString());
      const sender = await this.assertSender(enrollment.organizationId.toString(), enrollment.productId.toString(), sequence.senderId.toString());
      const unsubscribeUrl = await this.unsubscribeUrl(enrollment, lead);
      const rendered = await this.templateService.renderForSend(enrollment.organizationId.toString(), enrollment.productId.toString(), '', step.templateId.toString(), step.templateVersion, { leadId: lead._id.toString(), senderId: sender._id.toString(), opportunityId: enrollment.opportunityId?.toString(), campaignId: enrollment.campaignId?.toString(), unsubscribeUrl });
      const html = rendered.html && rendered.html.includes(unsubscribeUrl) ? rendered.html : rendered.html ? `${rendered.html}<p><a href="${unsubscribeUrl}">Unsubscribe</a></p>` : undefined;
      const text = rendered.text && rendered.text.includes(unsubscribeUrl) ? rendered.text : rendered.text ? `${rendered.text}\n\nUnsubscribe: ${unsubscribeUrl}` : `Unsubscribe: ${unsubscribeUrl}`;
      const message = await this.emailService.send({ organizationId: enrollment.organizationId.toString(), productId: enrollment.productId.toString(), connectionId: sender.emailConnectionId.toString(), senderId: sender._id.toString(), recipient: { email: lead.normalizedEmail || lead.email || '' }, purpose: 'marketing', subject: rendered.subject, html, text, idempotencyKey: execution.idempotencyKey, leadId: lead._id.toString(), opportunityId: enrollment.opportunityId?.toString(), campaignId: enrollment.campaignId?.toString(), emailSequenceId: sequence._id.toString(), emailSequenceEnrollmentId: enrollment._id.toString(), templateId: step.templateId.toString(), templateVersion: step.templateVersion, sendReason: 'future_sequence' });
      execution.emailMessageId = new Types.ObjectId(message.id);
      execution.status = message.status === 'accepted' ? 'accepted' : 'failed';
      execution.errorCode = message.status === 'accepted' ? undefined : message.errorCode || 'email_send_failed';
      execution.processedAt = new Date();
      await execution.save();
      if (message.status !== 'accepted') return this.failEnrollment(enrollment, 'failed');
      const next = await this.stepModel.findOne({ organizationId: enrollment.organizationId, productId: enrollment.productId, sequenceId: enrollment.sequenceId, order: { $gt: step.order } }).sort({ order: 1 }).exec();
      if (!next) return this.completeEnrollment(enrollment);
      enrollment.currentStepOrder = next.order;
      enrollment.nextStepAt = this.nextAt(new Date(), next);
      enrollment.lockedAt = undefined;
      enrollment.lockedBy = undefined;
      await enrollment.save();
      return this.toEnrollmentResponse(enrollment);
    } catch (err) {
      const reason = this.errorReason(err);
      execution.status = reason === 'failed' ? 'failed' : 'skipped';
      execution.errorCode = err instanceof Error ? err.message : 'email_sequence_step_failed';
      execution.skipReason = reason;
      execution.processedAt = new Date();
      await execution.save();
      return reason === 'failed' ? this.failEnrollment(enrollment, reason) : this.stopEnrollment(enrollment, reason);
    }
  }

  private async replaceSteps(organizationId: string, productId: string, sequence: EmailSequenceDocument, steps: EmailSequenceStepDto[]) {
    if (!steps.length || steps.length > MAX_STEPS) throw new BadRequestException('email_sequence_step_limit');
    const orders = new Set(steps.map((step) => step.order));
    if (orders.size !== steps.length) throw new BadRequestException('email_sequence_step_order_duplicate');
    for (const step of steps) {
      if (step.delayValue > 365) throw new BadRequestException('email_sequence_delay_invalid');
      await this.templateService.findVersion(organizationId, productId, step.templateId, step.templateVersion);
    }
    await this.stepModel.deleteMany({ organizationId: sequence.organizationId, productId: sequence.productId, sequenceId: sequence._id }).exec();
    await this.stepModel.insertMany(steps.sort((a, b) => a.order - b.order).map((step) => ({ organizationId: sequence.organizationId, productId: sequence.productId, sequenceId: sequence._id, order: step.order, delayValue: step.delayValue, delayUnit: step.delayUnit, templateId: new Types.ObjectId(step.templateId), templateVersion: step.templateVersion })));
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
    if (!email || !EMAIL_RE.test(email)) throw new BadRequestException('missing_email');
    const [qualification, conflict, suppression] = await Promise.all([
      this.qualificationModel.findOne({ organizationId: lead.organizationId, productId: lead.productId, leadId: lead._id }).exec(),
      this.conflictModel.exists({ organizationId: lead.organizationId, productId: lead.productId, status: 'unresolved', $or: [{ emailLeadId: lead._id }, { phoneLeadId: lead._id }] }),
      this.suppressionModel.exists({ organizationId: lead.organizationId, productId: lead.productId, normalizedEmail: email, active: true }),
    ]);
    if (conflict) throw new BadRequestException('identity_conflict');
    if (suppression) throw new BadRequestException('suppressed');
    const eligibility = qualification?.communicationEligibility ?? (lead.consentStatus === 'granted' ? 'allowed' : lead.consentStatus === 'denied' ? 'restricted' : 'unknown');
    if (eligibility !== 'allowed') throw new BadRequestException('communication_restricted');
    return lead;
  }

  private async assertOpportunity(organizationId: string, productId: string, opportunityId: string, leadId: string) {
    const doc = await this.opportunityModel.findOne({ _id: new Types.ObjectId(opportunityId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), leadId: new Types.ObjectId(leadId) }).exec();
    if (!doc) throw new BadRequestException('crm_opportunity_not_found');
  }

  private async executionFor(enrollment: EmailSequenceEnrollmentDocument, step: EmailSequenceStepDocument) {
    const idempotencyKey = `email-sequence:${enrollment._id}:step:${step._id}`;
    return this.executionModel.findOneAndUpdate(
      { organizationId: enrollment.organizationId, productId: enrollment.productId, idempotencyKey },
      { $setOnInsert: { sequenceId: enrollment.sequenceId, enrollmentId: enrollment._id, stepId: step._id, stepOrder: step.order, leadId: enrollment.leadId, status: 'pending', scheduledAt: enrollment.nextStepAt || new Date(), idempotencyKey } },
      { upsert: true, new: true },
    ).exec();
  }

  private nextAt(base: Date, step: EmailSequenceStepDocument | { delayValue: number; delayUnit: string }) {
    const ms = step.delayUnit === 'days' ? step.delayValue * 24 * 60 * 60 * 1000 : step.delayValue * 60 * 60 * 1000;
    return new Date(base.getTime() + ms);
  }

  private async completeEnrollment(enrollment: EmailSequenceEnrollmentDocument) {
    enrollment.status = 'completed';
    enrollment.completedAt = new Date();
    enrollment.nextStepAt = undefined;
    enrollment.lockedAt = undefined;
    enrollment.lockedBy = undefined;
    await enrollment.save();
    return this.toEnrollmentResponse(enrollment);
  }

  private async failEnrollment(enrollment: EmailSequenceEnrollmentDocument, reason: EmailSequenceStopReason) {
    enrollment.status = 'failed';
    enrollment.stopReason = reason;
    enrollment.stoppedAt = new Date();
    enrollment.nextStepAt = undefined;
    enrollment.lockedAt = undefined;
    enrollment.lockedBy = undefined;
    await enrollment.save();
    return this.toEnrollmentResponse(enrollment);
  }

  private async stopEnrollment(enrollment: EmailSequenceEnrollmentDocument, reason: EmailSequenceStopReason) {
    enrollment.status = reason === 'sequence_paused' ? 'paused' : 'stopped';
    enrollment.stopReason = reason;
    enrollment.stoppedAt = new Date();
    enrollment.nextStepAt = undefined;
    enrollment.lockedAt = undefined;
    enrollment.lockedBy = undefined;
    await enrollment.save();
    return this.toEnrollmentResponse(enrollment);
  }

  private errorReason(err: unknown): EmailSequenceStopReason {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('missing_email')) return 'missing_email';
    if (message.includes('identity_conflict')) return 'identity_conflict';
    if (message.includes('suppressed')) return 'suppressed';
    if (message.includes('communication')) return 'communication_restricted';
    return 'failed';
  }

  private async unsubscribeUrl(enrollment: EmailSequenceEnrollmentDocument, lead: LeadDocument) {
    const token = randomBytes(32).toString('base64url');
    const email = (lead.normalizedEmail || lead.email || '').trim().toLowerCase();
    await new this.unsubscribeTokenModel({ organizationId: enrollment.organizationId, productId: enrollment.productId, leadId: lead._id, normalizedEmail: email, tokenHash: createHash('sha256').update(token).digest('hex') }).save();
    const base = process.env.APP_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
    return `${base}/public/email/unsubscribe/${token}`;
  }

  private async findSequence(organizationId: string, productId: string, sequenceId: string) {
    if (!Types.ObjectId.isValid(sequenceId)) throw new NotFoundException('email_sequence_not_found');
    const doc = await this.sequenceModel.findOne({ _id: new Types.ObjectId(sequenceId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (!doc) throw new NotFoundException('email_sequence_not_found');
    return doc;
  }

  private async toSequenceResponse(sequence: EmailSequenceDocument, stepCount: number, counts: any[]) {
    const own = counts.filter((item) => item._id?.sequenceId?.toString?.() === sequence._id.toString());
    const count = (status: string) => own.find((item) => item._id.status === status)?.count ?? 0;
    return { id: sequence._id.toString(), organizationId: sequence.organizationId.toString(), productId: sequence.productId.toString(), name: sequence.name, campaignId: sequence.campaignId?.toString(), senderId: sequence.senderId.toString(), status: sequence.status, stopOnReply: Boolean(sequence.stopOnReply), stopOnOpportunityWon: Boolean(sequence.stopOnOpportunityWon), stepCount, activeEnrollments: count('active'), completedEnrollments: count('completed'), stoppedEnrollments: count('stopped'), failedEnrollments: count('failed'), createdByUserId: sequence.createdByUserId?.toString(), createdAt: sequence.createdAt, updatedAt: sequence.updatedAt };
  }

  private toStepResponse(step: EmailSequenceStepDocument) {
    return { id: step._id.toString(), sequenceId: step.sequenceId.toString(), order: step.order, delayValue: step.delayValue, delayUnit: step.delayUnit, templateId: step.templateId.toString(), templateVersion: step.templateVersion, createdAt: step.createdAt, updatedAt: step.updatedAt };
  }

  private toEnrollmentResponse(item: EmailSequenceEnrollmentDocument) {
    return { id: item._id.toString(), organizationId: item.organizationId.toString(), productId: item.productId.toString(), sequenceId: item.sequenceId.toString(), leadId: item.leadId.toString(), opportunityId: item.opportunityId?.toString(), campaignId: item.campaignId?.toString(), status: item.status, currentStepOrder: item.currentStepOrder, nextStepAt: item.nextStepAt, startedAt: item.startedAt, completedAt: item.completedAt, stoppedAt: item.stoppedAt, stopReason: item.stopReason, createdAt: item.createdAt, updatedAt: item.updatedAt };
  }
}
