import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model, Types } from 'mongoose';
import { CampaignsService } from '../../campaigns/campaigns.service';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { LeadIdentityConflict } from '../schemas/lead-identity-conflict.schema';
import { LeadSourceEvent, LeadSourceEventDocument } from '../schemas/lead-source-event.schema';
import { LeadSubmissionIdempotency, LeadSubmissionIdempotencyDocument } from '../schemas/lead-submission-idempotency.schema';
import type { LeadCaptureEndpointDocument } from '../schemas/lead-capture-endpoint.schema';
import { LeadDeduplicationService } from './lead-deduplication.service';
import { LeadQualificationService } from './lead-qualification.service';
import { LeadNormalizationService } from './lead-normalization.service';
import type { CaptureLeadInput, LeadCaptureOutcome, LeadQualificationResponse, LeadResponse, LeadSourceEventResponse } from '../types/lead-capture.types';
import type { LeadConsentStatus, LeadCustomFields } from '../types/lead.types';

@Injectable()
export class LeadCaptureService {
  constructor(
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(LeadSourceEvent.name) private readonly eventModel: Model<LeadSourceEventDocument>,
    @InjectModel(LeadIdentityConflict.name) private readonly conflictModel: Model<LeadIdentityConflict>,
    @InjectModel(LeadSubmissionIdempotency.name) private readonly idempotencyModel: Model<LeadSubmissionIdempotencyDocument>,
    private readonly campaignsService: CampaignsService,
    private readonly normalization: LeadNormalizationService,
    private readonly deduplication: LeadDeduplicationService,
    private readonly qualificationService: LeadQualificationService,
  ) {}

  async capture(input: CaptureLeadInput, idempotency?: { endpoint: LeadCaptureEndpointDocument; key?: string }): Promise<{ lead?: LeadResponse; event?: LeadSourceEventResponse; outcome: LeadCaptureOutcome }> {
    const normalized = this.normalizeInput(input);
    if (!normalized.normalizedEmail && !normalized.normalizedPhone) throw new BadRequestException('Lead requires an email or phone number.');
    if (input.campaignId) await this.campaignsService.findCampaignDoc(input.organizationId, input.productId, input.campaignId);

    const payloadHash = idempotency?.key ? this.hashPayload(normalized) : undefined;
    if (idempotency?.key && payloadHash) {
      const existing = await this.idempotencyModel.findOne({ endpointId: idempotency.endpoint._id, key: idempotency.key }).exec();
      if (existing) {
        if (existing.payloadHash !== payloadHash) throw new ConflictException('This submission key was already used for a different lead submission.');
        const lead = existing.leadId ? await this.leadModel.findById(existing.leadId).exec() : null;
        const event = existing.sourceEventId ? await this.eventModel.findById(existing.sourceEventId).exec() : null;
        return { lead: lead ? this.toLeadResponse(lead) : undefined, event: event ? this.toEventResponse(event) : undefined, outcome: existing.outcome };
      }
    }

    const deduped = await this.deduplication.resolve(input.organizationId, input.productId, normalized.normalizedEmail, normalized.normalizedPhone);
    if (deduped.outcome === 'identity_conflict') {
      await new this.conflictModel({
        organizationId: new Types.ObjectId(input.organizationId),
        productId: new Types.ObjectId(input.productId),
        emailLeadId: deduped.emailLead!._id,
        phoneLeadId: deduped.phoneLead!._id,
        normalizedEmail: normalized.normalizedEmail,
        normalizedPhone: normalized.normalizedPhone,
        sourceEventSnapshot: normalized.snapshot,
        status: 'unresolved',
      }).save();
      if (idempotency?.key && payloadHash) await this.saveIdempotency(idempotency.endpoint._id, idempotency.key, payloadHash, 'conflict');
      return { outcome: 'conflict' };
    }

    const now = new Date();
    let lead = deduped.lead;
    let outcome: LeadCaptureOutcome = 'matched';
    if (!lead) {
      outcome = 'created';
      lead = await this.createLead(input, normalized, now);
    }
    const event = await this.createEvent(input, lead, normalized, now);
    await this.applyCaptureToLead(lead, event, normalized, input.consent?.status, outcome);
    if (idempotency?.key && payloadHash) await this.saveIdempotency(idempotency.endpoint._id, idempotency.key, payloadHash, outcome, lead._id, event._id);
    const qualification = await this.qualificationService.recalculateLead(lead);
    return { lead: this.toLeadResponse(lead, qualification), event: this.toEventResponse(event), outcome };
  }

  private normalizeInput(input: CaptureLeadInput) {
    const normalizedEmail = this.normalization.normalizeEmail(input.contact.email);
    const normalizedPhone = this.normalization.normalizePhone(input.contact.phone);
    const customFields = this.normalization.normalizeCustomFields(input.customFields);
    const snapshot: LeadCustomFields = {
      ...customFields,
      ...(normalizedEmail ? { email: normalizedEmail } : {}),
      ...(normalizedPhone ? { phone: normalizedPhone } : {}),
    };
    return {
      normalizedEmail,
      normalizedPhone,
      email: normalizedEmail,
      phone: normalizedPhone,
      firstName: this.normalization.clean(input.contact.firstName, 120),
      lastName: this.normalization.clean(input.contact.lastName, 120),
      fullName: this.normalization.clean(input.contact.fullName, 240),
      companyName: this.normalization.clean(input.contact.companyName, 200),
      jobTitle: this.normalization.clean(input.contact.jobTitle, 160),
      country: this.normalization.clean(input.contact.country, 100),
      region: this.normalization.clean(input.contact.region, 100),
      city: this.normalization.clean(input.contact.city, 100),
      sourceName: this.normalization.clean(input.source.name, 200),
      channel: this.normalization.clean(input.source.channel, 100),
      platform: this.normalization.clean(input.source.platform, 100),
      sourceUrl: this.normalization.normalizeUrl(input.source.sourceUrl),
      landingPageUrl: this.normalization.normalizeUrl(input.source.landingPageUrl),
      referrerUrl: this.normalization.normalizeUrl(input.source.referrerUrl),
      externalSourceId: this.normalization.clean(input.source.externalSourceId, 200),
      utmSource: this.normalization.normalizeUtm(input.utm?.source),
      utmMedium: this.normalization.normalizeUtm(input.utm?.medium),
      utmCampaign: this.normalization.normalizeUtm(input.utm?.campaign),
      utmTerm: this.normalization.normalizeUtm(input.utm?.term),
      utmContent: this.normalization.normalizeUtm(input.utm?.content),
      customFields,
      notes: this.normalization.normalizeNotes(input.notes),
      consentSource: this.normalization.clean(input.consent?.source, 200),
      snapshot,
    };
  }

  private async createLead(input: CaptureLeadInput, n: ReturnType<LeadCaptureService['normalizeInput']>, now: Date): Promise<LeadDocument> {
    try {
      return await new this.leadModel({
        organizationId: new Types.ObjectId(input.organizationId),
        productId: new Types.ObjectId(input.productId),
        campaignId: input.campaignId ? new Types.ObjectId(input.campaignId) : undefined,
        firstName: n.firstName,
        lastName: n.lastName,
        fullName: n.fullName,
        email: n.email,
        normalizedEmail: n.normalizedEmail,
        phone: n.phone,
        normalizedPhone: n.normalizedPhone,
        companyName: n.companyName,
        jobTitle: n.jobTitle,
        country: n.country,
        region: n.region,
        city: n.city,
        status: 'new',
        sourceType: input.source.type,
        sourceName: n.sourceName,
        firstCapturedAt: now,
        latestCapturedAt: now,
        consentStatus: this.normalization.normalizeConsentStatus(input.consent?.status),
        consentCapturedAt: input.consent?.capturedAt ? new Date(input.consent.capturedAt) : input.consent?.status === 'granted' ? now : undefined,
        consentSource: n.consentSource,
        customFields: n.customFields,
        notes: n.notes,
      }).save();
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
      const found = await this.deduplication.resolve(input.organizationId, input.productId, n.normalizedEmail, n.normalizedPhone);
      if (found.lead) return found.lead;
      throw err;
    }
  }

  private async createEvent(input: CaptureLeadInput, lead: LeadDocument, n: ReturnType<LeadCaptureService['normalizeInput']>, now: Date): Promise<LeadSourceEventDocument> {
    return new this.eventModel({
      organizationId: new Types.ObjectId(input.organizationId),
      productId: new Types.ObjectId(input.productId),
      leadId: lead._id,
      campaignId: input.campaignId ? new Types.ObjectId(input.campaignId) : undefined,
      formId: input.formContext?.formId ? new Types.ObjectId(input.formContext.formId) : undefined,
      captureEndpointId: input.formContext?.captureEndpointId ? new Types.ObjectId(input.formContext.captureEndpointId) : undefined,
      sourceType: input.source.type,
      sourceName: n.sourceName,
      channel: n.channel,
      platform: n.platform,
      sourceUrl: n.sourceUrl,
      landingPageUrl: n.landingPageUrl,
      referrerUrl: n.referrerUrl,
      utmSource: n.utmSource,
      utmMedium: n.utmMedium,
      utmCampaign: n.utmCampaign,
      utmTerm: n.utmTerm,
      utmContent: n.utmContent,
      externalSourceId: n.externalSourceId,
      captureMethod: input.captureMethod,
      submittedDataSnapshot: n.snapshot,
      occurredAt: now,
    }).save();
  }

  private async applyCaptureToLead(lead: LeadDocument, event: LeadSourceEventDocument, n: ReturnType<LeadCaptureService['normalizeInput']>, consentStatus: LeadConsentStatus | undefined, outcome: LeadCaptureOutcome): Promise<void> {
    if (!lead.firstSourceEventId) lead.firstSourceEventId = event._id;
    lead.latestSourceEventId = event._id;
    lead.latestCapturedAt = event.occurredAt;
    if (outcome === 'matched') {
      if (!lead.firstName && n.firstName) lead.firstName = n.firstName;
      if (!lead.lastName && n.lastName) lead.lastName = n.lastName;
      if (!lead.fullName && n.fullName) lead.fullName = n.fullName;
      if (!lead.email && n.email) lead.email = n.email;
      if (!lead.normalizedEmail && n.normalizedEmail) lead.normalizedEmail = n.normalizedEmail;
      if (!lead.phone && n.phone) lead.phone = n.phone;
      if (!lead.normalizedPhone && n.normalizedPhone) lead.normalizedPhone = n.normalizedPhone;
      if (!lead.companyName && n.companyName) lead.companyName = n.companyName;
      if (!lead.jobTitle && n.jobTitle) lead.jobTitle = n.jobTitle;
      if (!lead.country && n.country) lead.country = n.country;
      if (!lead.region && n.region) lead.region = n.region;
      if (!lead.city && n.city) lead.city = n.city;
    }
    if (consentStatus === 'granted' || consentStatus === 'denied') {
      lead.consentStatus = consentStatus;
      lead.consentCapturedAt = event.occurredAt;
      if (n.consentSource) lead.consentSource = n.consentSource;
    }
    await lead.save();
  }

  private async saveIdempotency(endpointId: Types.ObjectId, key: string, payloadHash: string, outcome: LeadCaptureOutcome, leadId?: Types.ObjectId, sourceEventId?: Types.ObjectId): Promise<void> {
    try {
      await new this.idempotencyModel({ endpointId, key, payloadHash, outcome, leadId, sourceEventId }).save();
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }

  private hashPayload(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  toLeadResponse(lead: LeadDocument, qualification?: LeadQualificationResponse): LeadResponse {
    return {
      id: lead._id.toString(),
      organizationId: lead.organizationId.toString(),
      productId: lead.productId.toString(),
      campaignId: lead.campaignId?.toString(),
      firstName: lead.firstName,
      lastName: lead.lastName,
      fullName: lead.fullName,
      email: lead.email,
      phone: lead.phone,
      companyName: lead.companyName,
      crmAccountId: lead.crmAccountId?.toString(),
      jobTitle: lead.jobTitle,
      country: lead.country,
      region: lead.region,
      city: lead.city,
      status: lead.status,
      sourceType: lead.sourceType,
      sourceName: lead.sourceName,
      firstSourceEventId: lead.firstSourceEventId?.toString(),
      latestSourceEventId: lead.latestSourceEventId?.toString(),
      firstCapturedAt: lead.firstCapturedAt,
      latestCapturedAt: lead.latestCapturedAt,
      consentStatus: lead.consentStatus,
      consentCapturedAt: lead.consentCapturedAt,
      consentSource: lead.consentSource,
      customFields: Object.fromEntries((lead.customFields as unknown as Map<string, unknown>)?.entries?.() ?? Object.entries(lead.customFields ?? {})) as LeadCustomFields,
      notes: lead.notes,
      createdAt: lead.createdAt as Date,
      updatedAt: lead.updatedAt as Date,
      qualification,
    };
  }

  toEventResponse(event: LeadSourceEventDocument): LeadSourceEventResponse {
    return {
      id: event._id.toString(),
      campaignId: event.campaignId?.toString(),
      formId: event.formId?.toString(),
      captureEndpointId: event.captureEndpointId?.toString(),
      sourceType: event.sourceType,
      sourceName: event.sourceName,
      channel: event.channel,
      platform: event.platform,
      sourceUrl: event.sourceUrl,
      landingPageUrl: event.landingPageUrl,
      referrerUrl: event.referrerUrl,
      utmSource: event.utmSource,
      utmMedium: event.utmMedium,
      utmCampaign: event.utmCampaign,
      utmTerm: event.utmTerm,
      utmContent: event.utmContent,
      externalSourceId: event.externalSourceId,
      captureMethod: event.captureMethod,
      submittedDataSnapshot: Object.fromEntries((event.submittedDataSnapshot as unknown as Map<string, unknown>)?.entries?.() ?? Object.entries(event.submittedDataSnapshot ?? {})) as LeadCustomFields,
      occurredAt: event.occurredAt,
      createdAt: event.createdAt as Date,
    };
  }
}
