import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProductsService } from '../../products/products.service';
import { CompleteCrmFollowUpDto, CreateCrmFollowUpDto, UpdateCrmFollowUpDto } from '../dto/crm.dto';
import { CrmActivity, CrmActivityDocument } from '../schemas/crm-activity.schema';
import { CrmFollowUp, CrmFollowUpDocument } from '../schemas/crm-follow-up.schema';
import type { CrmFollowUpStatus } from '../types/crm.types';
import { CrmOpportunityService } from './crm-opportunity.service';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

@Injectable()
export class CrmFollowUpService {
  constructor(
    @InjectModel(CrmFollowUp.name) private readonly followUpModel: Model<CrmFollowUpDocument>,
    @InjectModel(CrmActivity.name) private readonly activityModel: Model<CrmActivityDocument>,
    private readonly productsService: ProductsService,
    private readonly opportunityService: CrmOpportunityService,
  ) {}

  async create(organizationId: string, productId: string, userId: string, opportunityId: string, dto: CreateCrmFollowUpDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const opportunity = await this.opportunityService.findOpportunityDoc(organizationId, productId, opportunityId);
    const dueAt = this.parseDueAt(dto.dueAt);
    this.validateTimezone(dto.timezone);
    const followUp = await new this.followUpModel({
      organizationId: opportunity.organizationId,
      productId: opportunity.productId,
      opportunityId: opportunity._id,
      leadId: opportunity.leadId,
      type: dto.type,
      title: dto.title.trim(),
      description: dto.description?.trim(),
      dueAt,
      timezone: dto.timezone,
      status: 'pending',
      assignedToUserId: dto.assignedToUserId ? new Types.ObjectId(dto.assignedToUserId) : opportunity.assignedToUserId,
      createdByUserId: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined,
    }).save();
    await this.record(followUp, 'follow_up_created', userId);
    return this.toResponse(followUp);
  }

  async list(organizationId: string, productId: string, userId: string, filter: Record<string, string | undefined>) {
    await this.productsService.findOne(organizationId, productId, userId);
    const query = this.buildQuery(organizationId, productId, filter);
    const limit = Math.min(Math.max(Number(filter.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const page = Math.max(Number(filter.page) || 1, 1);
    const [items, total] = await Promise.all([
      this.followUpModel.find(query).sort({ dueAt: 1 }).skip((page - 1) * limit).limit(limit).exec(),
      this.followUpModel.countDocuments(query).exec(),
    ]);
    return { items: items.map((item) => this.toResponse(item)), total, page, limit };
  }

  async get(organizationId: string, productId: string, userId: string, followUpId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    return this.toResponse(await this.findOwned(organizationId, productId, followUpId));
  }

  async update(organizationId: string, productId: string, userId: string, followUpId: string, dto: UpdateCrmFollowUpDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const followUp = await this.findOwned(organizationId, productId, followUpId);
    if (followUp.status !== 'pending') throw new BadRequestException('crm_follow_up_update_forbidden');
    if (dto.status && dto.status !== 'pending') throw new BadRequestException('crm_follow_up_update_forbidden');
    if (dto.type !== undefined) followUp.type = dto.type;
    if (dto.title !== undefined) followUp.title = dto.title.trim();
    if (dto.description !== undefined) followUp.description = dto.description.trim();
    if (dto.dueAt !== undefined) followUp.dueAt = this.parseDueAt(dto.dueAt);
    if (dto.timezone !== undefined) {
      this.validateTimezone(dto.timezone);
      followUp.timezone = dto.timezone;
    }
    if (dto.assignedToUserId !== undefined) followUp.assignedToUserId = dto.assignedToUserId ? new Types.ObjectId(dto.assignedToUserId) : undefined;
    await followUp.save();
    await this.record(followUp, 'follow_up_updated', userId);
    return this.toResponse(followUp);
  }

  async complete(organizationId: string, productId: string, userId: string, followUpId: string, dto: CompleteCrmFollowUpDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const followUp = await this.findOwned(organizationId, productId, followUpId);
    if (followUp.status !== 'pending') throw new BadRequestException('crm_follow_up_invalid_state');
    followUp.status = 'completed';
    followUp.completedAt = new Date();
    followUp.outcome = dto.outcome?.trim();
    await followUp.save();
    await this.record(followUp, 'follow_up_completed', userId, followUp.outcome);
    return this.toResponse(followUp);
  }

  async cancel(organizationId: string, productId: string, userId: string, followUpId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const followUp = await this.findOwned(organizationId, productId, followUpId);
    if (followUp.status !== 'pending') throw new BadRequestException('crm_follow_up_invalid_state');
    followUp.status = 'cancelled';
    followUp.cancelledAt = new Date();
    await followUp.save();
    await this.record(followUp, 'follow_up_cancelled', userId);
    return this.toResponse(followUp);
  }

  async reopen(organizationId: string, productId: string, userId: string, followUpId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const followUp = await this.findOwned(organizationId, productId, followUpId);
    if (followUp.status === 'pending') return this.toResponse(followUp);
    followUp.status = 'pending';
    followUp.completedAt = undefined;
    followUp.cancelledAt = undefined;
    await followUp.save();
    await this.record(followUp, 'follow_up_updated', userId);
    return this.toResponse(followUp);
  }

  private buildQuery(organizationId: string, productId: string, filter: Record<string, string | undefined>): Record<string, unknown> {
    const query: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) };
    if (filter.status && filter.status !== 'overdue') query.status = filter.status;
    if (filter.type) query.type = filter.type;
    for (const key of ['assignedToUserId', 'opportunityId', 'leadId']) if (filter[key]) query[key] = new Types.ObjectId(filter[key]);
    if (filter.dueFrom || filter.dueTo) query.dueAt = this.dateRange(filter.dueFrom, filter.dueTo);
    if (filter.overdue === 'true' || filter.status === 'overdue') {
      query.status = 'pending';
      query.dueAt = { ...(typeof query.dueAt === 'object' ? query.dueAt as Record<string, Date> : {}), $lt: new Date() };
    }
    return query;
  }

  private async findOwned(organizationId: string, productId: string, followUpId: string) {
    if (!Types.ObjectId.isValid(followUpId)) throw new NotFoundException('crm_follow_up_not_found');
    const followUp = await this.followUpModel.findOne({ _id: new Types.ObjectId(followUpId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (!followUp) throw new NotFoundException('crm_follow_up_not_found');
    return followUp;
  }

  private parseDueAt(value: string) {
    const dueAt = new Date(value);
    if (Number.isNaN(dueAt.getTime())) throw new BadRequestException('crm_follow_up_due_invalid');
    return dueAt;
  }

  private validateTimezone(timezone?: string) {
    if (!timezone) return;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      throw new BadRequestException('crm_follow_up_due_invalid');
    }
  }

  private dateRange(from?: string, to?: string) {
    const range: Record<string, Date> = {};
    if (from) range.$gte = this.parseDueAt(from);
    if (to) range.$lte = this.parseDueAt(to);
    return range;
  }

  private async record(followUp: CrmFollowUpDocument, type: 'follow_up_created' | 'follow_up_updated' | 'follow_up_completed' | 'follow_up_cancelled', userId: string, outcome?: string) {
    await new this.activityModel({
      organizationId: followUp.organizationId,
      productId: followUp.productId,
      opportunityId: followUp.opportunityId,
      leadId: followUp.leadId,
      type,
      metadata: { followUpId: followUp._id.toString(), followUpType: followUp.type, ...(outcome ? { outcome } : {}) },
      actorUserId: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : undefined,
    }).save();
  }

  toResponse(followUp: CrmFollowUpDocument) {
    const derivedStatus: CrmFollowUpStatus = followUp.status === 'pending' && followUp.dueAt.getTime() < Date.now() ? 'overdue' : followUp.status;
    return {
      id: followUp._id.toString(),
      organizationId: followUp.organizationId.toString(),
      productId: followUp.productId.toString(),
      opportunityId: followUp.opportunityId.toString(),
      leadId: followUp.leadId.toString(),
      type: followUp.type,
      title: followUp.title,
      description: followUp.description,
      dueAt: followUp.dueAt,
      timezone: followUp.timezone,
      status: derivedStatus,
      storedStatus: followUp.status,
      assignedToUserId: followUp.assignedToUserId?.toString(),
      completedAt: followUp.completedAt,
      cancelledAt: followUp.cancelledAt,
      outcome: followUp.outcome,
      createdByUserId: followUp.createdByUserId?.toString(),
      createdAt: followUp.createdAt,
      updatedAt: followUp.updatedAt,
    };
  }
}
