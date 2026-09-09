import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CampaignsService } from '../../campaigns/campaigns.service';
import { ProductsService } from '../../products/products.service';
import { LeadCaptureForm, LeadCaptureFormDocument } from '../schemas/lead-capture-form.schema';
import { LeadIdentityConflict, LeadIdentityConflictDocument } from '../schemas/lead-identity-conflict.schema';
import { LeadQualification, LeadQualificationDocument } from '../schemas/lead-qualification.schema';
import { LeadSourceEvent, LeadSourceEventDocument } from '../schemas/lead-source-event.schema';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { LeadCaptureService } from './lead-capture.service';
import { LeadQualificationService } from './lead-qualification.service';

const MAX_DASHBOARD_RANGE_DAYS = 365;

@Injectable()
export class LeadDashboardService {
  constructor(
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(LeadSourceEvent.name) private readonly eventModel: Model<LeadSourceEventDocument>,
    @InjectModel(LeadQualification.name) private readonly qualificationModel: Model<LeadQualificationDocument>,
    @InjectModel(LeadIdentityConflict.name) private readonly conflictModel: Model<LeadIdentityConflictDocument>,
    @InjectModel(LeadCaptureForm.name) private readonly formModel: Model<LeadCaptureFormDocument>,
    private readonly productsService: ProductsService,
    private readonly campaignsService: CampaignsService,
    private readonly leadCaptureService: LeadCaptureService,
    private readonly qualificationService: LeadQualificationService,
  ) {}

  async getDashboard(organizationId: string, productId: string, userId: string, query: { from?: string; to?: string; range?: string; timezone?: string }) {
    await this.productsService.findOne(organizationId, productId, userId);
    const { from, to, bucket } = this.resolveRange(query);
    const base = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) };
    const leadRange = { ...base, createdAt: { $gte: from, $lte: to } };
    const eventRange = { ...base, occurredAt: { $gte: from, $lte: to } };

    const [totalLeads, newLeads, convertedLeads, qualifiedLeads, needsReviewLeads, hotLeads, warmLeads, communicationAllowed, identityConflictCount, average, captureEvents, sourceEvents, sourceLeads, statusBreakdown, consentBreakdown, qualificationStatusBreakdown, gradeBreakdown, trend, recent, attentionQualifications, forms, formEvents, campaignEvents] = await Promise.all([
      this.leadModel.countDocuments(base).exec(),
      this.leadModel.countDocuments(leadRange).exec(),
      this.leadModel.countDocuments({ ...base, status: 'converted' }).exec(),
      this.qualificationModel.countDocuments({ ...base, qualificationStatus: 'qualified' }).exec(),
      this.qualificationModel.countDocuments({ ...base, qualificationStatus: 'needs_review' }).exec(),
      this.qualificationModel.countDocuments({ ...base, grade: 'hot' }).exec(),
      this.qualificationModel.countDocuments({ ...base, grade: 'warm' }).exec(),
      this.qualificationModel.countDocuments({ ...base, communicationEligibility: 'allowed' }).exec(),
      this.conflictModel.countDocuments({ ...base, status: 'unresolved' }).exec(),
      this.qualificationModel.aggregate([{ $match: base }, { $group: { _id: null, avg: { $avg: '$score' } } }]).exec(),
      this.eventModel.countDocuments(eventRange).exec(),
      this.eventModel.aggregate([{ $match: eventRange }, { $group: { _id: '$sourceType', captureEvents: { $sum: 1 }, leadIds: { $addToSet: '$leadId' } } }, { $project: { sourceType: '$_id', captureEvents: 1, uniqueLeads: { $size: '$leadIds' }, _id: 0 } }, { $sort: { uniqueLeads: -1 } }]).exec(),
      this.leadModel.aggregate([{ $match: leadRange }, { $group: { _id: '$sourceType', uniqueLeads: { $sum: 1 } } }, { $project: { sourceType: '$_id', uniqueLeads: 1, _id: 0 } }]).exec(),
      this.leadModel.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }, { $project: { status: '$_id', count: 1, _id: 0 } }]).exec(),
      this.leadModel.aggregate([{ $match: base }, { $group: { _id: '$consentStatus', count: { $sum: 1 } } }, { $project: { consentStatus: '$_id', count: 1, _id: 0 } }]).exec(),
      this.qualificationModel.aggregate([{ $match: base }, { $group: { _id: '$qualificationStatus', count: { $sum: 1 } } }, { $project: { qualificationStatus: '$_id', count: 1, _id: 0 } }]).exec(),
      this.qualificationModel.aggregate([{ $match: base }, { $group: { _id: '$grade', count: { $sum: 1 } } }, { $project: { grade: '$_id', count: 1, _id: 0 } }]).exec(),
      this.eventModel.aggregate([{ $match: eventRange }, { $group: { _id: { $dateToString: { format: bucket === 'day' ? '%Y-%m-%d' : '%G-W%V', date: '$occurredAt', timezone: 'UTC' } }, captureEvents: { $sum: 1 }, leadIds: { $addToSet: '$leadId' } } }, { $project: { period: '$_id', captureEvents: 1, uniqueLeadsCreated: { $size: '$leadIds' }, _id: 0 } }, { $sort: { period: 1 } }]).exec(),
      this.leadModel.find(base).sort({ latestCapturedAt: -1 }).limit(10).exec(),
      this.qualificationModel.find({ ...base, $or: [{ grade: 'hot' }, { qualificationStatus: 'needs_review' }, { communicationEligibility: { $in: ['restricted', 'unknown'] } }] }).sort({ score: -1 }).limit(30).exec(),
      this.formModel.find(base).sort({ createdAt: -1 }).exec(),
      this.eventModel.aggregate([{ $match: { ...eventRange, formId: { $exists: true } } }, { $group: { _id: '$formId', submissions: { $sum: 1 }, leadIds: { $addToSet: '$leadId' } } }, { $project: { formId: '$_id', submissions: 1, uniqueLeads: { $size: '$leadIds' }, leadIds: 1, _id: 0 } }]).exec(),
      this.eventModel.aggregate([{ $match: { ...eventRange, campaignId: { $exists: true } } }, { $group: { _id: '$campaignId', captureEvents: { $sum: 1 }, leadIds: { $addToSet: '$leadId' } } }, { $project: { campaignId: '$_id', captureEvents: 1, uniqueLeads: { $size: '$leadIds' }, leadIds: 1, _id: 0 } }, { $sort: { uniqueLeads: -1 } }]).exec(),
    ]);

    const qualifications = await this.qualificationService.getByLeadIds(organizationId, productId, recent.map((lead) => lead._id));
    const attentionLeadIds = attentionQualifications.map((item) => item.leadId);
    const attentionLeads = await this.leadModel.find({ ...base, _id: { $in: attentionLeadIds } }).limit(30).exec();
    const attentionMap = new Map(attentionLeads.map((lead) => [lead._id.toString(), lead]));
    const campaigns = await this.campaignsService.findAll(organizationId, productId, userId, {});
    const campaignMap = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));
    const formMap = new Map(forms.map((form) => [form._id.toString(), form]));

    return {
      range: { from: from.toISOString(), to: to.toISOString(), bucket, timezone: 'UTC' },
      summary: {
        totalLeads,
        newLeads,
        qualifiedLeads,
        needsReviewLeads,
        convertedLeads,
        averageLeadScore: Math.round((average[0]?.avg ?? 0) * 10) / 10,
        hotLeads,
        warmLeads,
        communicationAllowed,
        identityConflictCount,
        captureEvents,
      },
      trend,
      sourceBreakdown: this.mergeSourceBreakdown(sourceEvents, sourceLeads),
      campaignBreakdown: await this.withQualifiedCounts(campaignEvents, organizationId, productId, 'campaignId', campaignMap),
      formPerformance: await this.withQualifiedCounts(formEvents.map((item) => ({ ...item, name: formMap.get(item.formId?.toString())?.name ?? 'Unknown form' })), organizationId, productId, 'formId'),
      qualificationBreakdown: { grades: gradeBreakdown, statuses: qualificationStatusBreakdown },
      statusBreakdown,
      consentBreakdown,
      recentLeads: recent.map((lead) => this.leadCaptureService.toLeadResponse(lead, qualifications.get(lead._id.toString()))),
      needsAttention: {
        hotNewLeads: attentionQualifications.filter((item) => item.grade === 'hot').map((item) => this.toAttentionItem(item, attentionMap)).filter(Boolean).slice(0, 10),
        needsReview: attentionQualifications.filter((item) => item.qualificationStatus === 'needs_review').map((item) => this.toAttentionItem(item, attentionMap)).filter(Boolean).slice(0, 10),
        identityConflictCount,
        communicationNotReady: attentionQualifications.filter((item) => item.communicationEligibility !== 'allowed').length,
      },
    };
  }

  private resolveRange(query: { from?: string; to?: string; range?: string; timezone?: string }) {
    if (query.timezone && query.timezone !== 'UTC') {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: query.timezone });
      } catch {
        throw new BadRequestException('lead_dashboard_invalid_range');
      }
    }
    const to = query.to ? new Date(query.to) : new Date();
    const days = query.range === '7d' ? 7 : query.range === '90d' ? 90 : query.range === '365d' ? 365 : 30;
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new BadRequestException('lead_dashboard_invalid_range');
    if ((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000) > MAX_DASHBOARD_RANGE_DAYS) throw new BadRequestException('lead_dashboard_range_too_large');
    from.setUTCHours(0, 0, 0, 0);
    to.setUTCHours(23, 59, 59, 999);
    return { from, to, bucket: (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000) > 90 ? 'week' : 'day' };
  }

  private mergeSourceBreakdown(events: any[], leads: any[]) {
    const map = new Map<string, { sourceType: string; uniqueLeads: number; captureEvents: number }>();
    for (const item of events) map.set(item.sourceType, { sourceType: item.sourceType, uniqueLeads: item.uniqueLeads, captureEvents: item.captureEvents });
    for (const item of leads) map.set(item.sourceType, { sourceType: item.sourceType, uniqueLeads: item.uniqueLeads, captureEvents: map.get(item.sourceType)?.captureEvents ?? 0 });
    return [...map.values()].sort((a, b) => b.uniqueLeads - a.uniqueLeads);
  }

  private async withQualifiedCounts(items: any[], organizationId: string, productId: string, key: 'campaignId' | 'formId', names?: Map<string, string>) {
    const rows: Record<string, unknown>[] = [];
    for (const item of items.slice(0, 50)) {
      const qualified = item.leadIds?.length ? await this.qualificationModel.countDocuments({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), leadId: { $in: item.leadIds }, qualificationStatus: 'qualified' }).exec() : 0;
      const id = item[key]?.toString();
      rows.push({ [key]: id, name: item.name ?? names?.get(id) ?? 'Unknown', uniqueLeads: item.uniqueLeads, captureEvents: item.captureEvents ?? item.submissions, submissions: item.submissions, qualifiedLeads: qualified });
    }
    return rows;
  }

  private toAttentionItem(qualification: LeadQualificationDocument, leads: Map<string, LeadDocument>) {
    const lead = leads.get(qualification.leadId.toString());
    if (!lead) return null;
    return { leadId: lead._id.toString(), name: lead.fullName || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || lead.phone || 'Unnamed lead', status: lead.status, score: qualification.score, grade: qualification.grade, qualificationStatus: qualification.qualificationStatus, communicationEligibility: qualification.communicationEligibility };
  }
}
