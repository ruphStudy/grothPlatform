import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CampaignsService } from '../../campaigns/campaigns.service';
import { LeadIdentityConflict, LeadIdentityConflictDocument } from '../../leads/schemas/lead-identity-conflict.schema';
import { LeadQualification, LeadQualificationDocument } from '../../leads/schemas/lead-qualification.schema';
import { Lead, LeadDocument } from '../../leads/schemas/lead.schema';
import { LeadCaptureService } from '../../leads/services/lead-capture.service';
import { ProductsService } from '../../products/products.service';
import { CreateCrmAccountDto, ExportCrmOpportunitiesDto, UpdateCrmAccountDto } from '../dto/crm.dto';
import { CrmAccount, CrmAccountDocument } from '../schemas/crm-account.schema';
import { CrmActivity, CrmActivityDocument } from '../schemas/crm-activity.schema';
import { CrmFollowUp, CrmFollowUpDocument } from '../schemas/crm-follow-up.schema';
import { CrmOpportunity, CrmOpportunityDocument } from '../schemas/crm-opportunity.schema';
import { CrmPipeline, CrmPipelineDocument } from '../schemas/crm-pipeline.schema';
import { CrmStage, CrmStageDocument } from '../schemas/crm-stage.schema';
import { CRM_ACCOUNT_STATUSES } from '../types/crm.types';
import type { CrmAccountStatus } from '../types/crm.types';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const CRM_EXPORT_MAX_ROWS = Number(process.env.CRM_EXPORT_MAX_ROWS || 10000);
const EXPORT_FORMULA_PREFIXES = ['=', '+', '-', '@'];
const PUBLIC_EMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'zoho.com']);

@Injectable()
export class CrmAccountService {
  constructor(
    @InjectModel(CrmAccount.name) private readonly accountModel: Model<CrmAccountDocument>,
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(LeadQualification.name) private readonly qualificationModel: Model<LeadQualificationDocument>,
    @InjectModel(LeadIdentityConflict.name) private readonly conflictModel: Model<LeadIdentityConflictDocument>,
    @InjectModel(CrmOpportunity.name) private readonly opportunityModel: Model<CrmOpportunityDocument>,
    @InjectModel(CrmPipeline.name) private readonly pipelineModel: Model<CrmPipelineDocument>,
    @InjectModel(CrmStage.name) private readonly stageModel: Model<CrmStageDocument>,
    @InjectModel(CrmFollowUp.name) private readonly followUpModel: Model<CrmFollowUpDocument>,
    @InjectModel(CrmActivity.name) private readonly activityModel: Model<CrmActivityDocument>,
    private readonly productsService: ProductsService,
    private readonly campaignsService: CampaignsService,
    private readonly leadCaptureService: LeadCaptureService,
  ) {}

  async create(organizationId: string, productId: string, userId: string, dto: CreateCrmAccountDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const normalizedName = this.normalizeName(dto.name);
    if (!normalizedName) throw new BadRequestException('crm_account_invalid');
    const account = await new this.accountModel({
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      name: dto.name.trim(),
      normalizedName,
      website: this.clean(dto.website, 2048),
      domain: this.domainFromWebsite(dto.website),
      industry: this.clean(dto.industry, 160),
      country: this.clean(dto.country, 100),
      region: this.clean(dto.region, 100),
      city: this.clean(dto.city, 100),
      phone: this.clean(dto.phone, 40),
      ownerUserId: dto.ownerUserId ? new Types.ObjectId(dto.ownerUserId) : undefined,
      notes: this.clean(dto.notes, 5000),
      status: 'active',
    }).save();
    return { ...this.toAccountResponse(account), duplicateCandidates: await this.duplicateCandidates(account) };
  }

  async list(organizationId: string, productId: string, userId: string, filter: Record<string, string | undefined>) {
    await this.productsService.findOne(organizationId, productId, userId);
    const query: Record<string, any> = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) };
    if (filter.status) {
      if (!CRM_ACCOUNT_STATUSES.includes(filter.status as CrmAccountStatus)) throw new BadRequestException('crm_account_invalid');
      query.status = filter.status;
    }
    if (filter.ownerUserId) query.ownerUserId = new Types.ObjectId(filter.ownerUserId);
    if (filter.industry) query.industry = new RegExp(this.escape(filter.industry).slice(0, 120), 'i');
    if (filter.country) query.country = new RegExp(this.escape(filter.country).slice(0, 120), 'i');
    if (filter.search) {
      const search = this.escape(filter.search).slice(0, 120);
      query.$or = [{ name: new RegExp(search, 'i') }, { domain: new RegExp(search, 'i') }, { industry: new RegExp(search, 'i') }, { city: new RegExp(search, 'i') }];
    }
    const limit = Math.min(Math.max(Number(filter.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const page = Math.max(Number(filter.page) || 1, 1);
    const [accounts, total] = await Promise.all([
      this.accountModel.find(query).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).exec(),
      this.accountModel.countDocuments(query).exec(),
    ]);
    const counts = await this.accountCounts(organizationId, productId, accounts.map((item) => item._id));
    return { items: accounts.map((account) => ({ ...this.toAccountResponse(account), ...(counts.get(account._id.toString()) ?? {}) })), total, page, limit };
  }

  async get(organizationId: string, productId: string, userId: string, accountId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const account = await this.findOwned(organizationId, productId, accountId);
    const [contacts, opportunities, wonLost, activityOpportunityIds] = await Promise.all([
      this.leadModel.find({ organizationId: account.organizationId, productId: account.productId, crmAccountId: account._id }).sort({ latestCapturedAt: -1 }).limit(50).exec(),
      this.opportunityModel.find({ organizationId: account.organizationId, productId: account.productId, crmAccountId: account._id, status: 'open' }).sort({ updatedAt: -1 }).limit(50).exec(),
      this.opportunityModel.aggregate([{ $match: { organizationId: account.organizationId, productId: account.productId, crmAccountId: account._id, status: { $in: ['won', 'lost'] } } }, { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: { $ifNull: ['$amount', 0] } } } }]).exec(),
      this.opportunityModel.find({ organizationId: account.organizationId, productId: account.productId, crmAccountId: account._id }, { _id: 1 }).limit(200).exec(),
    ]);
    const opportunityIds = activityOpportunityIds.map((item) => item._id);
    const [pendingFollowUps, recentActivities, qualifications] = await Promise.all([
      opportunityIds.length ? this.followUpModel.find({ organizationId: account.organizationId, productId: account.productId, status: 'pending', opportunityId: { $in: opportunityIds } }).sort({ dueAt: 1 }).limit(25).exec() : Promise.resolve([]),
      opportunityIds.length ? this.activityModel.find({ organizationId: account.organizationId, productId: account.productId, opportunityId: { $in: opportunityIds } }).sort({ createdAt: -1 }).limit(25).exec() : Promise.resolve([]),
      this.qualificationMap(account.organizationId.toString(), account.productId.toString(), contacts.map((lead) => lead._id)),
    ]);
    const summary = new Map(wonLost.map((item) => [item._id, { count: item.count, amount: item.amount }]));
    return {
      ...this.toAccountResponse(account),
      duplicateCandidates: await this.duplicateCandidates(account),
      contacts: contacts.map((lead) => this.toContactSummary(lead, qualifications.get(lead._id.toString()), account)),
      openOpportunities: opportunities.map((opportunity) => this.toOpportunitySummary(opportunity)),
      wonLostSummary: { won: summary.get('won') ?? { count: 0, amount: 0 }, lost: summary.get('lost') ?? { count: 0, amount: 0 } },
      pendingFollowUps: pendingFollowUps.map((followUp) => this.toFollowUpSummary(followUp)),
      recentActivities: recentActivities.map((activity) => this.toActivitySummary(activity)),
    };
  }

  async update(organizationId: string, productId: string, userId: string, accountId: string, dto: UpdateCrmAccountDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const account = await this.findOwned(organizationId, productId, accountId);
    if (dto.name !== undefined) {
      account.normalizedName = this.normalizeName(dto.name);
      if (!account.normalizedName) throw new BadRequestException('crm_account_invalid');
      account.name = dto.name.trim();
    }
    if (dto.website !== undefined) {
      account.website = this.clean(dto.website, 2048);
      account.domain = this.domainFromWebsite(dto.website);
    }
    if (dto.industry !== undefined) account.industry = this.clean(dto.industry, 160);
    if (dto.country !== undefined) account.country = this.clean(dto.country, 100);
    if (dto.region !== undefined) account.region = this.clean(dto.region, 100);
    if (dto.city !== undefined) account.city = this.clean(dto.city, 100);
    if (dto.phone !== undefined) account.phone = this.clean(dto.phone, 40);
    if (dto.ownerUserId !== undefined) account.ownerUserId = dto.ownerUserId ? new Types.ObjectId(dto.ownerUserId) : undefined;
    if (dto.notes !== undefined) account.notes = this.clean(dto.notes, 5000);
    if (dto.status !== undefined) account.status = dto.status;
    await account.save();
    return { ...this.toAccountResponse(account), duplicateCandidates: await this.duplicateCandidates(account) };
  }

  async archive(organizationId: string, productId: string, userId: string, accountId: string) {
    return this.update(organizationId, productId, userId, accountId, { status: 'archived' });
  }

  async linkLead(organizationId: string, productId: string, userId: string, accountId: string, leadId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const [account, lead] = await Promise.all([this.findOwned(organizationId, productId, accountId), this.findLead(organizationId, productId, leadId)]);
    if (account.status === 'archived') throw new BadRequestException('crm_account_archived');
    lead.crmAccountId = account._id;
    await lead.save();
    await this.opportunityModel.updateMany({ organizationId: account.organizationId, productId: account.productId, leadId: lead._id, crmAccountId: { $exists: false } }, { crmAccountId: account._id }).exec();
    const qualification = await this.qualificationMap(organizationId, productId, [lead._id]);
    return this.toContactSummary(lead, qualification.get(lead._id.toString()), account);
  }

  async unlinkLead(organizationId: string, productId: string, userId: string, accountId: string, leadId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const [account, lead] = await Promise.all([this.findOwned(organizationId, productId, accountId), this.findLead(organizationId, productId, leadId)]);
    if (lead.crmAccountId?.equals(account._id)) {
      lead.crmAccountId = undefined;
      await lead.save();
    }
    const qualification = await this.qualificationMap(organizationId, productId, [lead._id]);
    return this.toContactSummary(lead, qualification.get(lead._id.toString()));
  }

  async suggestionsForLead(organizationId: string, productId: string, userId: string, leadId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const lead = await this.findLead(organizationId, productId, leadId);
    const normalizedName = this.normalizeName(lead.companyName);
    const emailDomain = this.companyDomainFromEmail(lead.normalizedEmail || lead.email);
    const query: Record<string, any>[] = [];
    if (normalizedName) query.push({ normalizedName });
    if (emailDomain) query.push({ domain: emailDomain });
    if (!query.length) return { items: [] };
    const accounts = await this.accountModel.find({ organizationId: lead.organizationId, productId: lead.productId, status: { $ne: 'archived' }, $or: query }).limit(10).exec();
    return { items: accounts.map((account) => this.toAccountResponse(account)) };
  }

  async exportOpportunities(organizationId: string, productId: string, userId: string, dto: ExportCrmOpportunitiesDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const query = this.opportunityQuery(organizationId, productId, dto.filters ?? {});
    if (dto.opportunityIds?.length) query._id = { $in: dto.opportunityIds.map((id) => new Types.ObjectId(id)) };
    const opportunities = await this.opportunityModel.find(query).sort({ updatedAt: -1 }).limit(CRM_EXPORT_MAX_ROWS + 1).exec();
    if (opportunities.length > CRM_EXPORT_MAX_ROWS) throw new BadRequestException('crm_export_too_large');
    const [accounts, leads, stages, pipelines, qualifications, campaigns] = await Promise.all([
      this.accountMap(organizationId, productId, opportunities.map((item) => item.crmAccountId).filter(Boolean) as Types.ObjectId[]),
      this.leadMap(organizationId, productId, opportunities.map((item) => item.leadId)),
      this.stageMap(organizationId, productId, opportunities.map((item) => item.stageId)),
      this.pipelineMap(organizationId, productId, opportunities.map((item) => item.pipelineId)),
      this.qualificationMap(organizationId, productId, opportunities.map((item) => item.leadId)),
      this.campaignsService.findAll(organizationId, productId, userId, {}),
    ]);
    const campaignNames = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));
    const headers = ['opportunityId', 'leadId', 'accountName', 'opportunityName', 'pipeline', 'stage', 'status', 'amount', 'currency', 'probability', 'expectedCloseDate', 'campaign', 'leadScore', 'leadGrade', 'createdAt', 'wonAt', 'lostAt', 'lostReason'];
    const lines = [headers.map((value) => this.csvCell(value)).join(',')];
    for (const opportunity of opportunities) {
      const account = opportunity.crmAccountId ? accounts.get(opportunity.crmAccountId.toString()) : undefined;
      const qualification = qualifications.get(opportunity.leadId.toString());
      lines.push([
        opportunity._id.toString(),
        opportunity.leadId.toString(),
        account?.name,
        opportunity.name,
        pipelines.get(opportunity.pipelineId.toString())?.name,
        stages.get(opportunity.stageId.toString())?.name,
        opportunity.status,
        opportunity.amount,
        opportunity.currency,
        opportunity.probability,
        opportunity.expectedCloseDate?.toISOString(),
        opportunity.campaignId ? campaignNames.get(opportunity.campaignId.toString()) : '',
        qualification?.score,
        qualification?.grade,
        opportunity.createdAt?.toISOString(),
        opportunity.wonAt?.toISOString(),
        opportunity.lostAt?.toISOString(),
        opportunity.lostReason,
      ].map((value) => this.csvCell(value)).join(','));
    }
    return { fileName: `crm-opportunities-${productId}.csv`, contentType: 'text/csv', rowCount: opportunities.length, csv: lines.join('\n') };
  }

  async assertLeadCommunicationAllowed(organizationId: string, productId: string, leadId: string) {
    const lead = await this.findLead(organizationId, productId, leadId);
    const qualification = await this.qualificationMap(organizationId, productId, [lead._id]);
    const eligibility = qualification.get(lead._id.toString())?.communicationEligibility ?? (lead.consentStatus === 'granted' ? 'allowed' : lead.consentStatus === 'denied' ? 'restricted' : 'unknown');
    if (eligibility !== 'allowed') throw new BadRequestException('crm_communication_restricted');
    return { allowed: true as const, eligibility };
  }

  async getPrimaryLeadEmail(organizationId: string, productId: string, leadId: string) {
    const lead = await this.findLead(organizationId, productId, leadId);
    return lead.normalizedEmail || lead.email || null;
  }

  normalizeName(value?: string) {
    return (value ?? '').toLowerCase().trim().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  domainFromWebsite(value?: string) {
    if (!value?.trim()) return undefined;
    try {
      const parsed = new URL(value.includes('://') ? value : `https://${value}`);
      return parsed.hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      throw new BadRequestException('crm_account_invalid');
    }
  }

  companyDomainFromEmail(value?: string) {
    const domain = value?.split('@')[1]?.toLowerCase();
    return domain && !PUBLIC_EMAIL_DOMAINS.has(domain) ? domain : undefined;
  }

  toAccountResponse(account: CrmAccountDocument) {
    return { id: account._id.toString(), organizationId: account.organizationId.toString(), productId: account.productId.toString(), name: account.name, normalizedName: account.normalizedName, website: account.website, domain: account.domain, industry: account.industry, country: account.country, region: account.region, city: account.city, phone: account.phone, status: account.status, ownerUserId: account.ownerUserId?.toString(), notes: account.notes, createdAt: account.createdAt, updatedAt: account.updatedAt };
  }

  private async duplicateCandidates(account: CrmAccountDocument) {
    const ors = [{ normalizedName: account.normalizedName }];
    if (account.domain) ors.push({ domain: account.domain } as any);
    const candidates = await this.accountModel.find({ organizationId: account.organizationId, productId: account.productId, _id: { $ne: account._id }, $or: ors }).limit(10).exec();
    return candidates.map((item) => this.toAccountResponse(item));
  }

  private async findOwned(organizationId: string, productId: string, accountId: string) {
    if (!Types.ObjectId.isValid(accountId)) throw new NotFoundException('crm_account_not_found');
    const account = await this.accountModel.findOne({ _id: new Types.ObjectId(accountId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (!account) throw new NotFoundException('crm_account_not_found');
    return account;
  }

  private async findLead(organizationId: string, productId: string, leadId: string) {
    if (!Types.ObjectId.isValid(leadId)) throw new NotFoundException('Lead not found.');
    const lead = await this.leadModel.findOne({ _id: new Types.ObjectId(leadId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (!lead) throw new NotFoundException('Lead not found.');
    return lead;
  }

  private toContactSummary(lead: LeadDocument, qualification?: LeadQualificationDocument, account?: CrmAccountDocument) {
    return { leadId: lead._id.toString(), displayName: lead.fullName || [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.email || lead.phone || 'Unnamed lead', email: lead.email, phone: lead.phone, account: account ? { id: account._id.toString(), name: account.name, domain: account.domain } : undefined, communicationEligibility: qualification?.communicationEligibility ?? (lead.consentStatus === 'granted' ? 'allowed' : lead.consentStatus === 'denied' ? 'restricted' : 'unknown'), status: lead.status, qualification: qualification?.qualificationStatus, score: qualification?.score, grade: qualification?.grade };
  }

  private async accountCounts(organizationId: string, productId: string, ids: Types.ObjectId[]) {
    const [leadCounts, opportunityCounts] = await Promise.all([
      this.leadModel.aggregate([{ $match: { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), crmAccountId: { $in: ids } } }, { $group: { _id: '$crmAccountId', contactsCount: { $sum: 1 } } }]).exec(),
      this.opportunityModel.aggregate([{ $match: { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), crmAccountId: { $in: ids }, status: 'open' } }, { $group: { _id: '$crmAccountId', openOpportunitiesCount: { $sum: 1 } } }]).exec(),
    ]);
    const map = new Map<string, { contactsCount?: number; openOpportunitiesCount?: number }>();
    for (const item of leadCounts) map.set(item._id.toString(), { ...(map.get(item._id.toString()) ?? {}), contactsCount: item.contactsCount });
    for (const item of opportunityCounts) map.set(item._id.toString(), { ...(map.get(item._id.toString()) ?? {}), openOpportunitiesCount: item.openOpportunitiesCount });
    return map;
  }

  private opportunityQuery(organizationId: string, productId: string, filter: Record<string, unknown>) {
    const query: Record<string, any> = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) };
    for (const key of ['pipelineId', 'stageId', 'assignedToUserId', 'campaignId', 'leadId', 'crmAccountId']) if (filter[key]) query[key] = new Types.ObjectId(String(filter[key]));
    if (filter.status) query.status = filter.status;
    return query;
  }

  private clean(value: unknown, max: number) {
    const text = typeof value === 'string' ? value.trim().slice(0, max) : '';
    return text || undefined;
  }

  private escape(value: string) {
    return value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private csvCell(value: unknown): string {
    let text = value === undefined || value === null ? '' : String(value);
    if (EXPORT_FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  private async accountMap(organizationId: string, productId: string, ids: Types.ObjectId[]) {
    const docs = ids.length ? await this.accountModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), _id: { $in: ids } }).exec() : [];
    return new Map(docs.map((doc) => [doc._id.toString(), doc]));
  }

  private async leadMap(organizationId: string, productId: string, ids: Types.ObjectId[]) {
    const docs = ids.length ? await this.leadModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), _id: { $in: ids } }).exec() : [];
    return new Map(docs.map((doc) => [doc._id.toString(), this.leadCaptureService.toLeadResponse(doc)]));
  }

  private async stageMap(organizationId: string, productId: string, ids: Types.ObjectId[]) {
    const docs = ids.length ? await this.stageModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), _id: { $in: ids } }).exec() : [];
    return new Map(docs.map((doc) => [doc._id.toString(), doc]));
  }

  private async pipelineMap(organizationId: string, productId: string, ids: Types.ObjectId[]) {
    const docs = ids.length ? await this.pipelineModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), _id: { $in: ids } }).exec() : [];
    return new Map(docs.map((doc) => [doc._id.toString(), doc]));
  }

  private async qualificationMap(organizationId: string, productId: string, leadIds: Types.ObjectId[]) {
    const docs = leadIds.length ? await this.qualificationModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), leadId: { $in: leadIds } }).exec() : [];
    return new Map(docs.map((doc) => [doc.leadId.toString(), doc]));
  }

  private toOpportunitySummary(opportunity: CrmOpportunityDocument) {
    return { id: opportunity._id.toString(), name: opportunity.name, status: opportunity.status, amount: opportunity.amount, currency: opportunity.currency, probability: opportunity.probability, stageId: opportunity.stageId.toString(), pipelineId: opportunity.pipelineId.toString(), expectedCloseDate: opportunity.expectedCloseDate, updatedAt: opportunity.updatedAt };
  }

  private toFollowUpSummary(followUp: CrmFollowUpDocument) {
    return { id: followUp._id.toString(), opportunityId: followUp.opportunityId.toString(), leadId: followUp.leadId.toString(), type: followUp.type, title: followUp.title, dueAt: followUp.dueAt, status: followUp.dueAt.getTime() < Date.now() && followUp.status === 'pending' ? 'overdue' : followUp.status };
  }

  private toActivitySummary(activity: CrmActivityDocument) {
    return { id: activity._id.toString(), opportunityId: activity.opportunityId.toString(), leadId: activity.leadId?.toString(), type: activity.type, createdAt: activity.createdAt };
  }
}
