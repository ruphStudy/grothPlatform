import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { LeadIdentityConflict, LeadIdentityConflictDocument } from '../schemas/lead-identity-conflict.schema';
import { LeadQualification, LeadQualificationDocument } from '../schemas/lead-qualification.schema';
import { LeadSourceEvent, LeadSourceEventDocument } from '../schemas/lead-source-event.schema';
import type { LeadQualificationReasonResponse, LeadQualificationResponse } from '../types/lead-capture.types';
import type { LeadCommunicationEligibility, LeadQualificationGrade, LeadQualificationStatus } from '../types/lead.types';

export const LEAD_SCORING_VERSION = 'lead-scoring:v1';

export const LEAD_SCORING_BANDS: Record<LeadQualificationGrade, { min: number; max: number }> = {
  hot: { min: 80, max: 100 },
  warm: { min: 60, max: 79 },
  cool: { min: 40, max: 59 },
  low: { min: 0, max: 39 },
};

interface EvaluateDataInput {
  lead: Pick<Lead, 'firstName' | 'lastName' | 'fullName' | 'email' | 'phone' | 'companyName' | 'jobTitle' | 'status' | 'sourceType' | 'campaignId' | 'consentStatus'>;
  sourceEventCount?: number;
  hasUnresolvedIdentityConflict?: boolean;
}

interface EvaluationResult {
  score: number;
  grade: LeadQualificationGrade;
  qualificationStatus: LeadQualificationStatus;
  reasons: LeadQualificationReasonResponse[];
  scoringVersion: string;
  communicationEligibility: LeadCommunicationEligibility;
  evaluatedAt: Date;
}

@Injectable()
export class LeadQualificationService {
  constructor(
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(LeadSourceEvent.name) private readonly eventModel: Model<LeadSourceEventDocument>,
    @InjectModel(LeadIdentityConflict.name) private readonly conflictModel: Model<LeadIdentityConflictDocument>,
    @InjectModel(LeadQualification.name) private readonly qualificationModel: Model<LeadQualificationDocument>,
  ) {}

  async evaluateLead(leadId: string): Promise<LeadQualificationResponse> {
    const lead = await this.leadModel.findById(new Types.ObjectId(leadId)).exec();
    if (!lead) throw new Error('Lead not found.');
    return this.recalculateLead(lead);
  }

  async recalculateLead(lead: LeadDocument): Promise<LeadQualificationResponse> {
    const [sourceEventCount, unresolvedConflict] = await Promise.all([
      this.eventModel.countDocuments({ organizationId: lead.organizationId, productId: lead.productId, leadId: lead._id }).exec(),
      this.conflictModel.exists({
        organizationId: lead.organizationId,
        productId: lead.productId,
        status: 'unresolved',
        $or: [{ emailLeadId: lead._id }, { phoneLeadId: lead._id }],
      }),
    ]);
    const evaluated = this.evaluateData({ lead, sourceEventCount, hasUnresolvedIdentityConflict: Boolean(unresolvedConflict) });
    const saved = await this.qualificationModel.findOneAndUpdate(
      { organizationId: lead.organizationId, productId: lead.productId, leadId: lead._id },
      { ...evaluated, organizationId: lead.organizationId, productId: lead.productId, leadId: lead._id },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();
    return this.toResponse(saved);
  }

  evaluateData(input: EvaluateDataInput): EvaluationResult {
    const reasons: LeadQualificationReasonResponse[] = [];
    const add = (ruleId: string, label: string, points: number, direction: LeadQualificationReasonResponse['direction']) => reasons.push({ ruleId, label, points, direction });
    const lead = input.lead;

    if (lead.email) add('contact.email', 'Email available', 18, 'positive');
    if (lead.phone) add('contact.phone', 'Phone available', 14, 'positive');
    if (lead.fullName || lead.firstName || lead.lastName) add('contact.name', 'Name context available', 12, 'positive');
    else add('contact.name_missing', 'Missing name context', -10, 'negative');
    if (lead.companyName) add('contact.company', 'Company context available', 12, 'positive');
    else add('contact.company_missing', 'Missing company context', -5, 'negative');
    if (lead.jobTitle) add('contact.role', 'Role context available', 6, 'positive');
    if (lead.campaignId) add('source.campaign', 'Campaign association present', 10, 'positive');

    const sourcePoints: Record<string, number> = { website_form: 12, landing_page: 12, campaign: 10, api: 8, social: 7, cms: 6, manual: 5, import: 4, other: 2 };
    add('source.quality', 'Source quality signal', sourcePoints[lead.sourceType] ?? 2, 'positive');

    const repeatCaptures = Math.max(0, Math.min(input.sourceEventCount ?? 0, 4) - 1);
    if (repeatCaptures > 0) add('engagement.repeat_capture', 'Repeat capture engagement', repeatCaptures * 5, 'positive');

    if (lead.consentStatus === 'granted') add('consent.granted', 'Communication consent granted', 10, 'positive');
    if (lead.consentStatus === 'denied') add('consent.denied', 'Communication consent denied', -25, 'negative');
    if (lead.consentStatus === 'unknown') add('consent.unknown', 'Communication consent unknown', 0, 'neutral');
    if (!lead.email && !lead.phone) add('contact.insufficient', 'Insufficient contact information', -40, 'negative');
    if (lead.status === 'archived') add('status.archived', 'Lead is archived', -35, 'negative');
    if (lead.status === 'unqualified') add('status.unqualified', 'Lead was marked unqualified', -35, 'negative');
    if (input.hasUnresolvedIdentityConflict) add('identity.conflict', 'Unresolved identity conflict needs review', -20, 'negative');

    const score = Math.max(0, Math.min(100, reasons.reduce((sum, reason) => sum + reason.points, 0)));
    const communicationEligibility: LeadCommunicationEligibility = lead.consentStatus === 'granted' ? 'allowed' : lead.consentStatus === 'denied' ? 'restricted' : 'unknown';
    const grade = this.gradeForScore(score);
    const qualificationStatus = this.statusFor(score, lead, Boolean(input.hasUnresolvedIdentityConflict));
    return { score, grade, qualificationStatus, reasons, scoringVersion: LEAD_SCORING_VERSION, communicationEligibility, evaluatedAt: new Date() };
  }

  async getByLeadIds(organizationId: string, productId: string, leadIds: Types.ObjectId[]): Promise<Map<string, LeadQualificationResponse>> {
    const docs = await this.qualificationModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), leadId: { $in: leadIds } }).exec();
    return new Map(docs.map((doc) => [doc.leadId.toString(), this.toResponse(doc)]));
  }

  async findMatchingLeadIds(organizationId: string, productId: string, filter: { grade?: string; qualificationStatus?: string; communicationEligibility?: string }): Promise<Types.ObjectId[] | undefined> {
    const query: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) };
    if (filter.grade) query.grade = filter.grade;
    if (filter.qualificationStatus) query.qualificationStatus = filter.qualificationStatus;
    if (filter.communicationEligibility) query.communicationEligibility = filter.communicationEligibility;
    if (Object.keys(query).length === 2) return undefined;
    const docs = await this.qualificationModel.find(query, { leadId: 1 }).limit(10000).exec();
    return docs.map((doc) => doc.leadId);
  }

  async sortedLeadIdsByScore(organizationId: string, productId: string, order: 1 | -1): Promise<Types.ObjectId[]> {
    const docs = await this.qualificationModel
      .find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }, { leadId: 1 })
      .sort({ score: order, evaluatedAt: -1 })
      .limit(10000)
      .exec();
    return docs.map((doc) => doc.leadId);
  }

  toResponse(doc: LeadQualificationDocument): LeadQualificationResponse {
    return {
      score: doc.score,
      grade: doc.grade,
      qualificationStatus: doc.qualificationStatus,
      reasons: (doc.reasons ?? []).map((reason) => ({ ruleId: reason.ruleId, label: reason.label, points: reason.points, direction: reason.direction })),
      scoringVersion: doc.scoringVersion,
      communicationEligibility: doc.communicationEligibility,
      evaluatedAt: doc.evaluatedAt,
    };
  }

  private gradeForScore(score: number): LeadQualificationGrade {
    if (score >= LEAD_SCORING_BANDS.hot.min) return 'hot';
    if (score >= LEAD_SCORING_BANDS.warm.min) return 'warm';
    if (score >= LEAD_SCORING_BANDS.cool.min) return 'cool';
    return 'low';
  }

  private statusFor(score: number, lead: EvaluateDataInput['lead'], hasConflict: boolean): LeadQualificationStatus {
    if (!lead.email && !lead.phone) return 'insufficient_data';
    if (hasConflict || lead.consentStatus === 'denied') return 'needs_review';
    if (lead.status === 'archived' || lead.status === 'unqualified') return 'unqualified';
    if (score >= 60) return 'qualified';
    if (score >= 40) return 'needs_review';
    return 'insufficient_data';
  }
}
