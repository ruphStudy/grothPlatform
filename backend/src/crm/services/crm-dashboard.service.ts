import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProductsService } from '../../products/products.service';
import { CrmActivity, CrmActivityDocument } from '../schemas/crm-activity.schema';
import { CrmFollowUp, CrmFollowUpDocument } from '../schemas/crm-follow-up.schema';
import { CrmOpportunity, CrmOpportunityDocument } from '../schemas/crm-opportunity.schema';
import { CrmPipeline, CrmPipelineDocument } from '../schemas/crm-pipeline.schema';
import { CrmStage, CrmStageDocument } from '../schemas/crm-stage.schema';
import { CrmPipelineService } from './crm-pipeline.service';

const MAX_RANGE_DAYS = 365;
const STALE_OPPORTUNITY_DAYS = Number(process.env.CRM_STALE_OPPORTUNITY_DAYS || 14);

@Injectable()
export class CrmDashboardService {
  constructor(
    @InjectModel(CrmOpportunity.name) private readonly opportunityModel: Model<CrmOpportunityDocument>,
    @InjectModel(CrmFollowUp.name) private readonly followUpModel: Model<CrmFollowUpDocument>,
    @InjectModel(CrmActivity.name) private readonly activityModel: Model<CrmActivityDocument>,
    @InjectModel(CrmPipeline.name) private readonly pipelineModel: Model<CrmPipelineDocument>,
    @InjectModel(CrmStage.name) private readonly stageModel: Model<CrmStageDocument>,
    private readonly productsService: ProductsService,
    private readonly pipelineService: CrmPipelineService,
  ) {}

  async getDashboard(organizationId: string, productId: string, userId: string, query: Record<string, string | undefined>) {
    await this.productsService.findOne(organizationId, productId, userId);
    await this.pipelineService.ensureDefaultPipeline(organizationId, productId, userId);
    const { from, to } = this.resolveRange(query);
    const base: Record<string, any> = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) };
    if (query.pipelineId) base.pipelineId = new Types.ObjectId(query.pipelineId);
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setUTCHours(23, 59, 59, 999);
    const next7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const staleBefore = new Date(now.getTime() - STALE_OPPORTUNITY_DAYS * 24 * 60 * 60 * 1000);
    const scopedOpportunityIds = query.pipelineId ? (await this.opportunityModel.find(base, { _id: 1 }).exec()).map((item) => item._id) : undefined;
    const followUpMatch = { organizationId: base.organizationId, productId: base.productId, ...(scopedOpportunityIds ? { opportunityId: { $in: scopedOpportunityIds } } : {}) };

    const [pipelines, stages, statusCounts, openValue, wonValue, closedCounts, stageDistribution, followUpCounts, completedInRange, overdueFollowUps, recentActivities, largestOpen, noNextFollowUpIds, staleOpportunities, expectedCloseOverdueCount] = await Promise.all([
      this.pipelineModel.find({ organizationId: base.organizationId, productId: base.productId, ...(query.pipelineId ? { _id: base.pipelineId } : {}) }).sort({ isDefault: -1, createdAt: 1 }).exec(),
      this.stageModel.find({ organizationId: base.organizationId, productId: base.productId, ...(query.pipelineId ? { pipelineId: base.pipelineId } : {}) }).sort({ order: 1 }).exec(),
      this.opportunityModel.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]).exec(),
      this.moneyGroup({ ...base, status: 'open' }),
      this.moneyGroup({ ...base, status: 'won', wonAt: { $gte: from, $lte: to } }),
      this.opportunityModel.aggregate([{ $match: { ...base, status: { $in: ['won', 'lost'] }, updatedAt: { $gte: from, $lte: to } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]).exec(),
      this.stageDistribution(base),
      this.followUpSummary(followUpMatch, now, todayStart, todayEnd, next7),
      this.followUpModel.countDocuments({ ...followUpMatch, status: 'completed', completedAt: { $gte: from, $lte: to } }).exec(),
      this.followUpModel.find({ ...followUpMatch, status: 'pending', dueAt: { $lt: now } }).sort({ dueAt: 1 }).limit(10).exec(),
      this.activityModel.find({ organizationId: base.organizationId, productId: base.productId, ...(scopedOpportunityIds ? { opportunityId: { $in: scopedOpportunityIds } } : {}) }).sort({ createdAt: -1 }).limit(20).exec(),
      this.opportunityModel.find({ ...base, status: 'open', amount: { $exists: true } }).sort({ amount: -1 }).limit(10).exec(),
      this.opportunitiesWithoutNextFollowUp(base, now),
      this.staleOpportunities(base, staleBefore),
      this.opportunityModel.countDocuments({ ...base, status: 'open', expectedCloseDate: { $lt: now } }).exec(),
    ]);

    const statusMap = new Map(statusCounts.map((item) => [item._id, item.count]));
    const closedMap = new Map(closedCounts.map((item) => [item._id, item.count]));
    const wonCount = closedMap.get('won') ?? 0;
    const lostCount = closedMap.get('lost') ?? 0;
    const closedDenominator = wonCount + lostCount;
    const pipelineMap = new Map(pipelines.map((pipeline) => [pipeline._id.toString(), this.pipelineService.toPipelineResponse(pipeline)]));
    const stageMap = new Map(stages.map((stage) => [stage._id.toString(), this.pipelineService.toStageResponse(stage)]));

    return {
      range: { from: from.toISOString(), to: to.toISOString(), timezone: 'UTC' },
      pipelines: [...pipelineMap.values()],
      summary: {
        openOpportunities: statusMap.get('open') ?? 0,
        wonOpportunities: statusMap.get('won') ?? 0,
        lostOpportunities: statusMap.get('lost') ?? 0,
        archivedOpportunities: statusMap.get('archived') ?? 0,
        totalOpenAmountByCurrency: openValue,
        wonAmountByCurrency: wonValue,
        wonCount,
        lostCount,
        closedOpportunityWinRate: closedDenominator ? Math.round((wonCount / closedDenominator) * 1000) / 10 : null,
        expectedCloseOverdueCount,
      },
      stageDistribution: stageDistribution.map((item) => ({ stage: stageMap.get(item.stageId), stageId: item.stageId, stageName: stageMap.get(item.stageId)?.name ?? 'Unknown', category: stageMap.get(item.stageId)?.category ?? 'open', opportunityCount: item.opportunityCount, amountByCurrency: item.amountByCurrency })),
      followUps: { ...followUpCounts, completedInRange, overdueItems: overdueFollowUps.map((item) => this.toFollowUpSummary(item)) },
      pipelineHealth: {
        staleOpportunityCount: staleOpportunities.length,
        staleOpportunities: staleOpportunities.map((item) => this.toOpportunitySummary(item, pipelineMap, stageMap)),
        opportunitiesWithoutNextFollowUp: noNextFollowUpIds.length,
        expectedCloseOverdueCount,
        overdueFollowUpCount: followUpCounts.overdue,
      },
      recentActivities: recentActivities.map((item) => this.toActivitySummary(item)),
      largestOpenOpportunities: largestOpen.map((item) => this.toOpportunitySummary(item, pipelineMap, stageMap)),
    };
  }

  private async moneyGroup(match: Record<string, any>) {
    return this.opportunityModel.aggregate([{ $match: { ...match, amount: { $gte: 0 }, currency: { $type: 'string' } } }, { $group: { _id: '$currency', amount: { $sum: '$amount' } } }, { $project: { currency: '$_id', amount: 1, _id: 0 } }, { $sort: { currency: 1 } }]).exec();
  }

  private async stageDistribution(base: Record<string, any>) {
    return this.opportunityModel.aggregate([
      { $match: { ...base, status: { $ne: 'archived' } } },
      { $group: { _id: { stageId: '$stageId', currency: '$currency' }, count: { $sum: 1 }, amount: { $sum: { $ifNull: ['$amount', 0] } } } },
      { $group: { _id: '$_id.stageId', opportunityCount: { $sum: '$count' }, amounts: { $push: { currency: '$_id.currency', amount: '$amount' } } } },
      { $project: { stageId: { $toString: '$_id' }, opportunityCount: 1, amountByCurrency: { $filter: { input: '$amounts', as: 'money', cond: { $ne: ['$$money.currency', null] } } }, _id: 0 } },
    ]).exec();
  }

  private async followUpSummary(match: Record<string, any>, now: Date, todayStart: Date, todayEnd: Date, next7: Date) {
    const [pending, dueToday, dueNext7Days, overdue] = await Promise.all([
      this.followUpModel.countDocuments({ ...match, status: 'pending' }).exec(),
      this.followUpModel.countDocuments({ ...match, status: 'pending', dueAt: { $gte: todayStart, $lte: todayEnd } }).exec(),
      this.followUpModel.countDocuments({ ...match, status: 'pending', dueAt: { $gt: todayEnd, $lte: next7 } }).exec(),
      this.followUpModel.countDocuments({ ...match, status: 'pending', dueAt: { $lt: now } }).exec(),
    ]);
    return { pending, dueToday, dueNext7Days, overdue };
  }

  private async opportunitiesWithoutNextFollowUp(base: Record<string, any>, now: Date) {
    const opportunities = await this.opportunityModel.find({ ...base, status: 'open' }, { _id: 1 }).limit(1000).exec();
    const future = await this.followUpModel.find({ organizationId: base.organizationId, productId: base.productId, status: 'pending', dueAt: { $gte: now }, opportunityId: { $in: opportunities.map((item) => item._id) } }, { opportunityId: 1 }).exec();
    const covered = new Set(future.map((item) => item.opportunityId.toString()));
    return opportunities.map((item) => item._id.toString()).filter((id) => !covered.has(id));
  }

  private async staleOpportunities(base: Record<string, any>, staleBefore: Date) {
    return this.opportunityModel.find({ ...base, status: 'open', updatedAt: { $lt: staleBefore } }).sort({ updatedAt: 1 }).limit(10).exec();
  }

  private resolveRange(query: Record<string, string | undefined>) {
    if (query.timezone && query.timezone !== 'UTC') {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: query.timezone });
      } catch {
        throw new BadRequestException('crm_dashboard_invalid_range');
      }
    }
    const to = query.to ? new Date(query.to) : new Date();
    const days = query.range === '7d' ? 7 : query.range === '90d' ? 90 : 30;
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new BadRequestException('crm_dashboard_invalid_range');
    if ((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000) > MAX_RANGE_DAYS) throw new BadRequestException('crm_dashboard_range_too_large');
    from.setUTCHours(0, 0, 0, 0);
    to.setUTCHours(23, 59, 59, 999);
    return { from, to };
  }

  private toFollowUpSummary(followUp: CrmFollowUpDocument) {
    return { id: followUp._id.toString(), opportunityId: followUp.opportunityId.toString(), leadId: followUp.leadId.toString(), type: followUp.type, title: followUp.title, dueAt: followUp.dueAt, status: followUp.dueAt.getTime() < Date.now() && followUp.status === 'pending' ? 'overdue' : followUp.status, assignedToUserId: followUp.assignedToUserId?.toString() };
  }

  private toOpportunitySummary(opportunity: CrmOpportunityDocument, pipelines: Map<string, unknown>, stages: Map<string, unknown>) {
    return { id: opportunity._id.toString(), name: opportunity.name, status: opportunity.status, amount: opportunity.amount, currency: opportunity.currency, probability: opportunity.probability, expectedCloseDate: opportunity.expectedCloseDate, pipeline: pipelines.get(opportunity.pipelineId.toString()), stage: stages.get(opportunity.stageId.toString()), updatedAt: opportunity.updatedAt };
  }

  private toActivitySummary(activity: CrmActivityDocument) {
    return { id: activity._id.toString(), opportunityId: activity.opportunityId.toString(), leadId: activity.leadId?.toString(), type: activity.type, fromStageId: activity.fromStageId?.toString(), toStageId: activity.toStageId?.toString(), actorUserId: activity.actorUserId?.toString(), createdAt: activity.createdAt };
  }
}
