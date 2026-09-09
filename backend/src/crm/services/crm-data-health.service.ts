import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LeadIdentityConflict, LeadIdentityConflictDocument } from '../../leads/schemas/lead-identity-conflict.schema';
import { Lead, LeadDocument } from '../../leads/schemas/lead.schema';
import { ProductsService } from '../../products/products.service';
import { CrmAccount, CrmAccountDocument } from '../schemas/crm-account.schema';
import { CrmFollowUp, CrmFollowUpDocument } from '../schemas/crm-follow-up.schema';
import { CrmOpportunity, CrmOpportunityDocument } from '../schemas/crm-opportunity.schema';
import { CrmPipeline, CrmPipelineDocument } from '../schemas/crm-pipeline.schema';
import { CrmStage, CrmStageDocument } from '../schemas/crm-stage.schema';

type IssueSeverity = 'critical' | 'warning';
type CrmDataHealthIssue = { code: string; severity: IssueSeverity; entityType: string; entityId: string; message: string };

const MAX_ISSUES = 200;

@Injectable()
export class CrmDataHealthService {
  constructor(
    @InjectModel(CrmOpportunity.name) private readonly opportunityModel: Model<CrmOpportunityDocument>,
    @InjectModel(CrmAccount.name) private readonly accountModel: Model<CrmAccountDocument>,
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(LeadIdentityConflict.name) private readonly conflictModel: Model<LeadIdentityConflictDocument>,
    @InjectModel(CrmPipeline.name) private readonly pipelineModel: Model<CrmPipelineDocument>,
    @InjectModel(CrmStage.name) private readonly stageModel: Model<CrmStageDocument>,
    @InjectModel(CrmFollowUp.name) private readonly followUpModel: Model<CrmFollowUpDocument>,
    private readonly productsService: ProductsService,
  ) {}

  async getDataHealth(organizationId: string, productId: string, userId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const base = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) };
    const issues: CrmDataHealthIssue[] = [];

    const [openOpportunities, inactiveStages, inactivePipelines, unresolvedConflicts, duplicateAccounts, closedOpportunityIds] = await Promise.all([
      this.opportunityModel.find({ ...base, status: 'open' }).limit(1000).exec(),
      this.stageModel.find({ ...base, isActive: false }).limit(500).exec(),
      this.pipelineModel.find({ ...base, isActive: false }).limit(200).exec(),
      this.conflictModel.find({ ...base, status: 'unresolved' }).limit(50).exec(),
      this.duplicateAccountCandidates(base),
      this.opportunityModel.find({ ...base, status: { $in: ['won', 'lost', 'archived'] } }, { _id: 1 }).limit(1000).exec(),
    ]);

    const leadIds = openOpportunities.map((item) => item.leadId).filter(Boolean);
    const stageIds = openOpportunities.map((item) => item.stageId).filter(Boolean);
    const pipelineIds = openOpportunities.map((item) => item.pipelineId).filter(Boolean);
    const [leads, stages, pipelines] = await Promise.all([
      this.leadModel.find({ ...base, _id: { $in: leadIds } }, { status: 1 }).exec(),
      this.stageModel.find({ ...base, _id: { $in: stageIds } }, { isActive: 1 }).exec(),
      this.pipelineModel.find({ ...base, _id: { $in: pipelineIds } }, { isActive: 1 }).exec(),
    ]);
    const leadMap = new Map(leads.map((lead) => [lead._id.toString(), lead]));
    const stageMap = new Map(stages.map((stage) => [stage._id.toString(), stage]));
    const pipelineMap = new Map(pipelines.map((pipeline) => [pipeline._id.toString(), pipeline]));

    for (const opportunity of openOpportunities) {
      const id = opportunity._id.toString();
      const lead = opportunity.leadId ? leadMap.get(opportunity.leadId.toString()) : undefined;
      const stage = opportunity.stageId ? stageMap.get(opportunity.stageId.toString()) : undefined;
      const pipeline = opportunity.pipelineId ? pipelineMap.get(opportunity.pipelineId.toString()) : undefined;
      if (!lead) this.push(issues, 'CRM_OPPORTUNITY_MISSING_LEAD', 'critical', 'opportunity', id, 'Open opportunity is missing a valid lead.');
      if (lead?.status === 'archived') this.push(issues, 'CRM_LEAD_ARCHIVED_WITH_OPEN_OPPORTUNITY', 'warning', 'opportunity', id, 'Open opportunity points to an archived lead.');
      if (!stage) this.push(issues, 'CRM_OPPORTUNITY_MISSING_STAGE', 'critical', 'opportunity', id, 'Open opportunity is missing a valid stage.');
      if (stage && !stage.isActive) this.push(issues, 'CRM_STAGE_INACTIVE_WITH_OPEN_OPPORTUNITY', 'warning', 'opportunity', id, 'Open opportunity is assigned to an inactive stage.');
      if (pipeline && !pipeline.isActive) this.push(issues, 'CRM_PIPELINE_INACTIVE_WITH_OPEN_OPPORTUNITY', 'warning', 'opportunity', id, 'Open opportunity is assigned to an inactive pipeline.');
      if (opportunity.amount !== undefined && opportunity.amount < 0) this.push(issues, 'CRM_OPPORTUNITY_MALFORMED_AMOUNT', 'warning', 'opportunity', id, 'Opportunity amount is malformed.');
      if (opportunity.probability !== undefined && (opportunity.probability < 0 || opportunity.probability > 100)) this.push(issues, 'CRM_OPPORTUNITY_MALFORMED_PROBABILITY', 'warning', 'opportunity', id, 'Opportunity probability is malformed.');
      if (opportunity.currency && !/^[A-Z]{3}$/.test(opportunity.currency)) this.push(issues, 'CRM_OPPORTUNITY_MALFORMED_CURRENCY', 'warning', 'opportunity', id, 'Opportunity currency is malformed.');
      if (opportunity.expectedCloseDate && Number.isNaN(new Date(opportunity.expectedCloseDate).getTime())) this.push(issues, 'CRM_OPPORTUNITY_MALFORMED_DATE', 'warning', 'opportunity', id, 'Opportunity expected close date is malformed.');
    }

    for (const stage of inactiveStages) {
      if (openOpportunities.some((opportunity) => opportunity.stageId?.equals(stage._id))) this.push(issues, 'CRM_STAGE_INACTIVE_WITH_OPEN_OPPORTUNITY', 'warning', 'stage', stage._id.toString(), 'Inactive stage still contains open opportunities.');
    }
    for (const pipeline of inactivePipelines) {
      if (openOpportunities.some((opportunity) => opportunity.pipelineId?.equals(pipeline._id))) this.push(issues, 'CRM_PIPELINE_INACTIVE_WITH_OPEN_OPPORTUNITY', 'warning', 'pipeline', pipeline._id.toString(), 'Inactive pipeline still contains open opportunities.');
    }
    for (const conflict of unresolvedConflicts) this.push(issues, 'CRM_LEAD_IDENTITY_CONFLICT', 'warning', 'lead_identity_conflict', conflict._id.toString(), 'Lead identity conflict is unresolved.');
    for (const candidate of duplicateAccounts) this.push(issues, 'CRM_ACCOUNT_DUPLICATE_CANDIDATE', 'warning', 'account', candidate.entityId, candidate.message);

    const closedIds = closedOpportunityIds.map((item) => item._id);
    const followUps = closedIds.length ? await this.followUpModel.find({ ...base, status: 'pending', opportunityId: { $in: closedIds } }).limit(100).exec() : [];
    for (const followUp of followUps) this.push(issues, 'CRM_FOLLOWUP_ON_CLOSED_OPPORTUNITY', 'warning', 'follow_up', followUp._id.toString(), 'Pending follow-up is attached to a closed or archived opportunity.');

    const bounded = issues.slice(0, MAX_ISSUES);
    const criticalCount = bounded.filter((issue) => issue.severity === 'critical').length;
    const warningCount = bounded.filter((issue) => issue.severity === 'warning').length;
    return { issueCount: bounded.length, criticalCount, warningCount, issues: bounded };
  }

  private async duplicateAccountCandidates(base: { organizationId: Types.ObjectId; productId: Types.ObjectId }) {
    const [byDomain, byName] = await Promise.all([
      this.accountModel.aggregate([{ $match: { ...base, domain: { $type: 'string' }, status: { $ne: 'archived' } } }, { $group: { _id: '$domain', ids: { $push: '$_id' }, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $limit: 50 }]).exec(),
      this.accountModel.aggregate([{ $match: { ...base, normalizedName: { $type: 'string' }, status: { $ne: 'archived' } } }, { $group: { _id: '$normalizedName', ids: { $push: '$_id' }, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $limit: 50 }]).exec(),
    ]);
    return [...byDomain.map((item) => ({ entityId: item.ids[0].toString(), message: `Duplicate account candidate shares domain ${item._id}.` })), ...byName.map((item) => ({ entityId: item.ids[0].toString(), message: `Duplicate account candidate shares normalized name ${item._id}.` }))];
  }

  private push(issues: CrmDataHealthIssue[], code: string, severity: IssueSeverity, entityType: string, entityId: string, message: string) {
    if (issues.length < MAX_ISSUES) issues.push({ code, severity, entityType, entityId, message });
  }
}
