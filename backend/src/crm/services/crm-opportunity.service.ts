import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model, Types } from 'mongoose';
import { CampaignsService } from '../../campaigns/campaigns.service';
import { ProductsService } from '../../products/products.service';
import { LeadIdentityConflict, LeadIdentityConflictDocument } from '../../leads/schemas/lead-identity-conflict.schema';
import { LeadQualification, LeadQualificationDocument } from '../../leads/schemas/lead-qualification.schema';
import { LeadSourceEvent, LeadSourceEventDocument } from '../../leads/schemas/lead-source-event.schema';
import { Lead, LeadDocument } from '../../leads/schemas/lead.schema';
import { LeadCaptureService } from '../../leads/services/lead-capture.service';
import { AddCrmOpportunityNoteDto, ConvertLeadToOpportunityDto, CreateCrmOpportunityDto, MoveCrmOpportunityStageDto, UpdateCrmOpportunityDto } from '../dto/crm.dto';
import { CrmActivity, CrmActivityDocument } from '../schemas/crm-activity.schema';
import { CrmConversionIdempotency, CrmConversionIdempotencyDocument } from '../schemas/crm-conversion-idempotency.schema';
import { CrmOpportunity, CrmOpportunityDocument } from '../schemas/crm-opportunity.schema';
import { CrmPipeline, CrmPipelineDocument } from '../schemas/crm-pipeline.schema';
import { CrmStage, CrmStageDocument } from '../schemas/crm-stage.schema';
import type { CrmActivityType } from '../types/crm.types';
import { CrmPipelineService } from './crm-pipeline.service';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const BOARD_LIMIT = 200;

@Injectable()
export class CrmOpportunityService {
  constructor(
    @InjectModel(CrmOpportunity.name) private readonly opportunityModel: Model<CrmOpportunityDocument>,
    @InjectModel(CrmActivity.name) private readonly activityModel: Model<CrmActivityDocument>,
    @InjectModel(CrmConversionIdempotency.name) private readonly idempotencyModel: Model<CrmConversionIdempotencyDocument>,
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(LeadSourceEvent.name) private readonly eventModel: Model<LeadSourceEventDocument>,
    @InjectModel(LeadQualification.name) private readonly qualificationModel: Model<LeadQualificationDocument>,
    @InjectModel(LeadIdentityConflict.name) private readonly conflictModel: Model<LeadIdentityConflictDocument>,
    @InjectModel(CrmPipeline.name) private readonly pipelineModel: Model<CrmPipelineDocument>,
    @InjectModel(CrmStage.name) private readonly stageModel: Model<CrmStageDocument>,
    private readonly productsService: ProductsService,
    private readonly campaignsService: CampaignsService,
    private readonly leadCaptureService: LeadCaptureService,
    private readonly pipelineService: CrmPipelineService,
  ) {}

  async convertLead(organizationId: string, productId: string, userId: string, leadId: string, dto: ConvertLeadToOpportunityDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const lead = await this.findLead(organizationId, productId, leadId);
    if (lead.status === 'archived') throw new BadRequestException('crm_lead_not_convertible');
    await this.assertNoIdentityConflict(organizationId, productId, lead._id);
    const hash = this.hashPayload({ ...dto, idempotencyKey: undefined });
    const existing = await this.idempotencyModel.findOne({ organizationId: lead.organizationId, productId: lead.productId, leadId: lead._id, idempotencyKey: dto.idempotencyKey }).exec();
    if (existing) {
      if (existing.payloadHash !== hash) throw new ConflictException('crm_conversion_conflict');
      return this.get(organizationId, productId, userId, existing.opportunityId.toString());
    }
    const opportunity = await this.createFromLead(organizationId, productId, userId, lead, dto);
    try {
      await new this.idempotencyModel({ organizationId: lead.organizationId, productId: lead.productId, leadId: lead._id, idempotencyKey: dto.idempotencyKey, payloadHash: hash, opportunityId: opportunity._id }).save();
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
      const raced = await this.idempotencyModel.findOne({ organizationId: lead.organizationId, productId: lead.productId, leadId: lead._id, idempotencyKey: dto.idempotencyKey }).exec();
      if (raced?.payloadHash === hash) return this.get(organizationId, productId, userId, raced.opportunityId.toString());
      throw new ConflictException('crm_conversion_conflict');
    }
    lead.status = 'converted';
    await lead.save();
    await this.recordActivity(opportunity, 'lead_converted', userId);
    await this.recordActivity(opportunity, 'opportunity_created', userId);
    return this.get(organizationId, productId, userId, opportunity._id.toString());
  }

  async create(organizationId: string, productId: string, userId: string, dto: CreateCrmOpportunityDto) {
    return this.convertLead(organizationId, productId, userId, dto.leadId, dto);
  }

  async list(organizationId: string, productId: string, userId: string, filter: Record<string, string | undefined>) {
    await this.productsService.findOne(organizationId, productId, userId);
    const query: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) };
    for (const key of ['pipelineId', 'stageId', 'assignedToUserId', 'campaignId', 'leadId']) if (filter[key]) query[key] = new Types.ObjectId(filter[key]);
    if (filter.status) query.status = filter.status;
    if (filter.createdFrom || filter.createdTo) query.createdAt = this.dateRange(filter.createdFrom, filter.createdTo);
    if (filter.expectedCloseFrom || filter.expectedCloseTo) query.expectedCloseDate = this.dateRange(filter.expectedCloseFrom, filter.expectedCloseTo);
    if (filter.search) {
      const leadIds = await this.searchLeadIds(organizationId, productId, filter.search);
      const term = filter.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 120);
      query.$or = [{ name: new RegExp(term, 'i') }, { leadId: { $in: leadIds } }];
    }
    const limit = Math.min(Math.max(Number(filter.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const page = Math.max(Number(filter.page) || 1, 1);
    const sort = this.resolveSort(filter.sort, filter.order);
    const [items, total] = await Promise.all([this.opportunityModel.find(query).sort(sort).skip((page - 1) * limit).limit(limit).exec(), this.opportunityModel.countDocuments(query).exec()]);
    return { items: await this.enrich(items, organizationId, productId, userId, false), total, page, limit };
  }

  async get(organizationId: string, productId: string, userId: string, opportunityId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const opportunity = await this.findOpportunity(organizationId, productId, opportunityId);
    const [detail] = await this.enrich([opportunity], organizationId, productId, userId, true);
    return detail;
  }

  async update(organizationId: string, productId: string, userId: string, opportunityId: string, dto: UpdateCrmOpportunityDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const opportunity = await this.findOpportunity(organizationId, productId, opportunityId);
    if (dto.status && dto.status !== 'archived') throw new BadRequestException('crm_invalid_stage_transition');
    if (dto.amount !== undefined) this.validateAmount(dto.amount);
    if (dto.currency !== undefined) this.validateCurrency(dto.currency);
    if (dto.probability !== undefined) this.validateProbability(dto.probability);
    if (dto.name !== undefined) opportunity.name = dto.name.trim();
    if (dto.amount !== undefined) opportunity.amount = dto.amount;
    if (dto.currency !== undefined) opportunity.currency = dto.currency.toUpperCase();
    if (dto.probability !== undefined) {
      opportunity.probability = dto.probability;
      opportunity.probabilitySource = 'manual';
    }
    if (dto.expectedCloseDate !== undefined) opportunity.expectedCloseDate = dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : undefined;
    if (dto.assignedToUserId !== undefined) opportunity.assignedToUserId = dto.assignedToUserId ? new Types.ObjectId(dto.assignedToUserId) : undefined;
    if (dto.description !== undefined) opportunity.description = dto.description.trim();
    if (dto.status === 'archived') opportunity.status = 'archived';
    await opportunity.save();
    await this.recordActivity(opportunity, 'opportunity_updated', userId);
    return this.get(organizationId, productId, userId, opportunityId);
  }

  async moveStage(organizationId: string, productId: string, userId: string, opportunityId: string, dto: MoveCrmOpportunityStageDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const opportunity = await this.findOpportunity(organizationId, productId, opportunityId);
    const stage = await this.pipelineService.findStageDoc(organizationId, productId, dto.stageId);
    if (!stage.isActive) throw new BadRequestException('crm_stage_inactive');
    if (!stage.pipelineId.equals(opportunity.pipelineId)) throw new BadRequestException('crm_stage_pipeline_mismatch');
    const fromStageId = opportunity.stageId;
    const wasClosed = opportunity.status === 'won' || opportunity.status === 'lost';
    opportunity.stageId = stage._id;
    if (opportunity.probabilitySource !== 'manual') opportunity.probability = stage.probability;
    if (stage.category === 'won') {
      opportunity.status = 'won';
      opportunity.wonAt = new Date();
      opportunity.lostAt = undefined;
      opportunity.lostReason = undefined;
    } else if (stage.category === 'lost') {
      opportunity.status = 'lost';
      opportunity.lostAt = new Date();
      opportunity.wonAt = undefined;
      opportunity.lostReason = dto.lostReason?.trim();
    } else {
      opportunity.status = 'open';
      opportunity.wonAt = undefined;
      opportunity.lostAt = undefined;
      opportunity.lostReason = undefined;
    }
    await opportunity.save();
    await this.recordActivity(opportunity, 'stage_changed', userId, fromStageId, stage._id);
    if (stage.category === 'won') await this.recordActivity(opportunity, 'won', userId);
    if (stage.category === 'lost') await this.recordActivity(opportunity, 'lost', userId);
    if (wasClosed && stage.category === 'open') await this.recordActivity(opportunity, 'reopened', userId);
    return this.get(organizationId, productId, userId, opportunityId);
  }

  async markWon(organizationId: string, productId: string, userId: string, opportunityId: string) {
    const opportunity = await this.findOpportunity(organizationId, productId, opportunityId);
    const stage = await this.pipelineService.findTerminalStage(organizationId, productId, opportunity.pipelineId.toString(), 'won');
    return this.moveStage(organizationId, productId, userId, opportunityId, { stageId: stage._id.toString() });
  }

  async markLost(organizationId: string, productId: string, userId: string, opportunityId: string, body: { lostReason?: string }) {
    const opportunity = await this.findOpportunity(organizationId, productId, opportunityId);
    const stage = await this.pipelineService.findTerminalStage(organizationId, productId, opportunity.pipelineId.toString(), 'lost');
    return this.moveStage(organizationId, productId, userId, opportunityId, { stageId: stage._id.toString(), lostReason: body.lostReason });
  }

  async addNote(organizationId: string, productId: string, userId: string, opportunityId: string, dto: AddCrmOpportunityNoteDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const opportunity = await this.findOpportunity(organizationId, productId, opportunityId);
    await this.recordActivity(opportunity, 'note_added', userId, undefined, undefined, dto.note.trim());
    return this.get(organizationId, productId, userId, opportunityId);
  }

  async board(organizationId: string, productId: string, userId: string, pipelineId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const pipeline = await this.pipelineService.findPipelineDoc(organizationId, productId, pipelineId);
    const stages = await this.pipelineService.listStageDocs(organizationId, productId, pipelineId, true);
    const opportunities = await this.opportunityModel.find({ organizationId: pipeline.organizationId, productId: pipeline.productId, pipelineId: pipeline._id, status: { $ne: 'archived' } }).sort({ updatedAt: -1 }).limit(BOARD_LIMIT).exec();
    const enriched = await this.enrich(opportunities, organizationId, productId, userId, false);
    return { pipeline: this.pipelineService.toPipelineResponse(pipeline), stages: stages.map((stage) => ({ ...this.pipelineService.toStageResponse(stage), opportunities: enriched.filter((item) => item.stageId === stage._id.toString()), totalCount: opportunities.filter((item) => item.stageId.equals(stage._id)).length })), totalCards: opportunities.length, truncated: opportunities.length >= BOARD_LIMIT };
  }

  async linkedForLead(organizationId: string, productId: string, leadId: Types.ObjectId) {
    const opportunities = await this.opportunityModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), leadId }).sort({ updatedAt: -1 }).limit(20).exec();
    return this.enrich(opportunities, organizationId, productId, '', false);
  }

  private async createFromLead(organizationId: string, productId: string, userId: string, lead: LeadDocument, dto: ConvertLeadToOpportunityDto) {
    if (dto.amount !== undefined) this.validateAmount(dto.amount);
    if (dto.currency !== undefined) this.validateCurrency(dto.currency);
    if (dto.probability !== undefined) this.validateProbability(dto.probability);
    const product = await this.productsService.findOne(organizationId, productId, userId);
    const { pipeline, stage } = await this.pipelineService.resolvePipelineAndStage(organizationId, productId, userId, dto.pipelineId, dto.stageId);
    const latestEvent = lead.latestSourceEventId ? await this.eventModel.findOne({ _id: lead.latestSourceEventId, organizationId: lead.organizationId, productId: lead.productId }).exec() : null;
    if (lead.campaignId) await this.campaignsService.findOne(organizationId, productId, lead.campaignId.toString(), userId);
    return new this.opportunityModel({
      organizationId: lead.organizationId,
      productId: lead.productId,
      pipelineId: pipeline._id,
      stageId: stage._id,
      leadId: lead._id,
      campaignId: lead.campaignId,
      name: dto.name?.trim() || `${lead.fullName || lead.email || lead.phone || 'Lead'} - ${product.name}`,
      status: 'open',
      amount: dto.amount,
      currency: dto.currency?.toUpperCase(),
      probability: dto.probability ?? stage.probability,
      probabilitySource: dto.probability === undefined ? 'stage' : 'manual',
      expectedCloseDate: dto.expectedCloseDate ? new Date(dto.expectedCloseDate) : undefined,
      assignedToUserId: dto.assignedToUserId ? new Types.ObjectId(dto.assignedToUserId) : undefined,
      sourceType: lead.sourceType,
      sourceEventId: latestEvent?._id,
      description: dto.description?.trim(),
    }).save();
  }

  private async enrich(opportunities: CrmOpportunityDocument[], organizationId: string, productId: string, userId: string, includeActivities: boolean) {
    const leadIds = opportunities.map((item) => item.leadId);
    const pipelineIds = opportunities.map((item) => item.pipelineId);
    const stageIds = opportunities.map((item) => item.stageId);
    const campaignIds = opportunities.map((item) => item.campaignId).filter(Boolean) as Types.ObjectId[];
    const [leads, qualifications, pipelines, stages, activities, campaigns] = await Promise.all([
      this.leadModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), _id: { $in: leadIds } }).exec(),
      this.qualificationModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), leadId: { $in: leadIds } }).exec(),
      this.pipelineModelFind(organizationId, productId, pipelineIds),
      this.stageModelFind(organizationId, productId, stageIds),
      includeActivities ? this.activityModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), opportunityId: { $in: opportunities.map((item) => item._id) } }).sort({ createdAt: -1 }).limit(100).exec() : Promise.resolve([]),
      campaignIds.length && userId ? this.campaignsService.findAll(organizationId, productId, userId, {}) : Promise.resolve([]),
    ]);
    const leadMap = new Map(leads.map((lead) => [lead._id.toString(), lead]));
    const qualificationMap = new Map(qualifications.map((item) => [item.leadId.toString(), item]));
    const pipelineMap = new Map(pipelines.map((item) => [item.id, item]));
    const stageMap = new Map(stages.map((item) => [item.id, item]));
    const campaignMap = new Map(campaigns.map((item) => [item.id, item]));
    const activityMap = new Map<string, any[]>();
    for (const activity of activities) {
      const key = activity.opportunityId.toString();
      activityMap.set(key, [...(activityMap.get(key) ?? []), this.toActivityResponse(activity)]);
    }
    return opportunities.map((opportunity) => {
      const lead = leadMap.get(opportunity.leadId.toString());
      const qualification = qualificationMap.get(opportunity.leadId.toString());
      return { ...this.toOpportunityResponse(opportunity), lead: lead ? this.leadCaptureService.toLeadResponse(lead, qualification ? { score: qualification.score, grade: qualification.grade, qualificationStatus: qualification.qualificationStatus, reasons: qualification.reasons as any, scoringVersion: qualification.scoringVersion, communicationEligibility: qualification.communicationEligibility, evaluatedAt: qualification.evaluatedAt } : undefined) : undefined, pipeline: pipelineMap.get(opportunity.pipelineId.toString()), stage: stageMap.get(opportunity.stageId.toString()), campaign: opportunity.campaignId ? campaignMap.get(opportunity.campaignId.toString()) : undefined, activities: includeActivities ? activityMap.get(opportunity._id.toString()) ?? [] : undefined };
    });
  }

  private async pipelineModelFind(organizationId: string, productId: string, ids: Types.ObjectId[]) {
    const docs = await this.pipelineModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), _id: { $in: ids } }).exec();
    return docs.map((doc: CrmPipelineDocument) => this.pipelineService.toPipelineResponse(doc));
  }

  private async stageModelFind(organizationId: string, productId: string, ids: Types.ObjectId[]) {
    const docs = await this.stageModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), _id: { $in: ids } }).exec();
    return docs.map((doc: CrmStageDocument) => this.pipelineService.toStageResponse(doc));
  }

  private async findLead(organizationId: string, productId: string, leadId: string) {
    if (!Types.ObjectId.isValid(leadId)) throw new NotFoundException('crm_lead_not_convertible');
    const lead = await this.leadModel.findOne({ _id: new Types.ObjectId(leadId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (!lead) throw new NotFoundException('crm_lead_not_convertible');
    return lead;
  }

  private async findOpportunity(organizationId: string, productId: string, opportunityId: string) {
    if (!Types.ObjectId.isValid(opportunityId)) throw new NotFoundException('crm_opportunity_not_found');
    const opportunity = await this.opportunityModel.findOne({ _id: new Types.ObjectId(opportunityId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (!opportunity) throw new NotFoundException('crm_opportunity_not_found');
    return opportunity;
  }

  private async assertNoIdentityConflict(organizationId: string, productId: string, leadId: Types.ObjectId) {
    const conflict = await this.conflictModel.exists({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), status: 'unresolved', $or: [{ emailLeadId: leadId }, { phoneLeadId: leadId }] });
    if (conflict) throw new BadRequestException('crm_identity_conflict');
  }

  private async searchLeadIds(organizationId: string, productId: string, search: string) {
    const term = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 120);
    const leads = await this.leadModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), $or: [{ fullName: new RegExp(term, 'i') }, { email: new RegExp(term, 'i') }, { companyName: new RegExp(term, 'i') }] }, { _id: 1 }).limit(200).exec();
    return leads.map((lead) => lead._id);
  }

  private async recordActivity(opportunity: CrmOpportunityDocument, type: CrmActivityType, userId: string, fromStageId?: Types.ObjectId, toStageId?: Types.ObjectId, note?: string) {
    await new this.activityModel({ organizationId: opportunity.organizationId, productId: opportunity.productId, opportunityId: opportunity._id, leadId: opportunity.leadId, type, fromStageId, toStageId, note, metadata: {}, actorUserId: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined }).save();
  }

  private resolveSort(sort?: string, order?: string): Record<string, 1 | -1> {
    const map: Record<string, string> = { createdAt: 'createdAt', updatedAt: 'updatedAt', expectedCloseDate: 'expectedCloseDate', amount: 'amount', probability: 'probability', name: 'name' };
    return { [map[sort || 'updatedAt'] || 'updatedAt']: order === 'asc' ? 1 : -1 };
  }

  private dateRange(from?: string, to?: string) {
    const range: Record<string, Date> = {};
    if (from) range.$gte = new Date(from);
    if (to) range.$lte = new Date(to);
    return range;
  }

  private validateAmount(value: number) {
    if (value < 0) throw new BadRequestException('crm_invalid_amount');
  }

  private validateCurrency(value: string) {
    if (value && !/^[A-Za-z]{3}$/.test(value)) throw new BadRequestException('crm_invalid_currency');
  }

  private validateProbability(value: number) {
    if (value < 0 || value > 100) throw new BadRequestException('crm_invalid_probability');
  }

  private hashPayload(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private toOpportunityResponse(opportunity: CrmOpportunityDocument) {
    return { id: opportunity._id.toString(), organizationId: opportunity.organizationId.toString(), productId: opportunity.productId.toString(), pipelineId: opportunity.pipelineId.toString(), stageId: opportunity.stageId.toString(), leadId: opportunity.leadId.toString(), campaignId: opportunity.campaignId?.toString(), name: opportunity.name, status: opportunity.status, amount: opportunity.amount, currency: opportunity.currency, probability: opportunity.probability, probabilitySource: opportunity.probabilitySource, expectedCloseDate: opportunity.expectedCloseDate, assignedToUserId: opportunity.assignedToUserId?.toString(), sourceType: opportunity.sourceType, sourceEventId: opportunity.sourceEventId?.toString(), description: opportunity.description, wonAt: opportunity.wonAt, lostAt: opportunity.lostAt, lostReason: opportunity.lostReason, createdAt: opportunity.createdAt, updatedAt: opportunity.updatedAt };
  }

  private toActivityResponse(activity: CrmActivityDocument) {
    return { id: activity._id.toString(), opportunityId: activity.opportunityId.toString(), leadId: activity.leadId?.toString(), type: activity.type, fromStageId: activity.fromStageId?.toString(), toStageId: activity.toStageId?.toString(), note: activity.note, metadata: Object.fromEntries((activity.metadata as unknown as Map<string, unknown>)?.entries?.() ?? Object.entries(activity.metadata ?? {})), actorUserId: activity.actorUserId?.toString(), createdAt: activity.createdAt };
  }
}
