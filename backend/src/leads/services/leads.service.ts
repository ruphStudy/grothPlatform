import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CampaignsService } from '../../campaigns/campaigns.service';
import { ProductsService } from '../../products/products.service';
import { ManualLeadDto, UpdateLeadDto } from '../dto/lead-common.dto';
import { Lead, LeadDocument } from '../schemas/lead.schema';
import { LeadSourceEvent, LeadSourceEventDocument } from '../schemas/lead-source-event.schema';
import { LeadCaptureService } from './lead-capture.service';
import { LeadNormalizationService } from './lead-normalization.service';
import type { LeadDetailResponse, LeadListFilter, LeadResponse } from '../types/lead-capture.types';
import { LEAD_SOURCE_TYPES, LEAD_STATUSES } from '../types/lead.types';
import type { LeadStatus } from '../types/lead.types';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

@Injectable()
export class LeadsService {
  constructor(
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(LeadSourceEvent.name) private readonly eventModel: Model<LeadSourceEventDocument>,
    private readonly productsService: ProductsService,
    private readonly campaignsService: CampaignsService,
    private readonly leadCaptureService: LeadCaptureService,
    private readonly normalization: LeadNormalizationService,
  ) {}

  async manualCreate(organizationId: string, productId: string, userId: string, dto: ManualLeadDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    if (dto.campaignId) await this.campaignsService.findOne(organizationId, productId, dto.campaignId, userId);
    return this.leadCaptureService.capture({
      organizationId,
      productId,
      campaignId: dto.campaignId,
      contact: dto,
      source: { type: 'manual', name: 'Manual Entry', channel: 'manual' },
      consent: dto.consent,
      customFields: dto.customFields,
      notes: dto.notes,
      captureMethod: 'manual',
    });
  }

  async list(organizationId: string, productId: string, userId: string, filter: LeadListFilter): Promise<{ items: LeadResponse[]; total: number; page: number; limit: number }> {
    await this.productsService.findOne(organizationId, productId, userId);
    const query: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
    };
    if (filter.status) {
      if (!LEAD_STATUSES.includes(filter.status as LeadStatus)) throw new BadRequestException('Invalid lead status filter.');
      query.status = filter.status;
    }
    if (filter.sourceType) {
      if (!LEAD_SOURCE_TYPES.includes(filter.sourceType as any)) throw new BadRequestException('Invalid lead source filter.');
      query.sourceType = filter.sourceType;
    }
    if (filter.campaignId) query.campaignId = new Types.ObjectId(filter.campaignId);
    if (filter.createdFrom || filter.createdTo) {
      const range: Record<string, Date> = {};
      if (filter.createdFrom) range.$gte = new Date(filter.createdFrom);
      if (filter.createdTo) range.$lte = new Date(filter.createdTo);
      query.createdAt = range;
    }
    if (filter.search) {
      const search = filter.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 120);
      query.$or = [
        { email: new RegExp(search, 'i') },
        { phone: new RegExp(search, 'i') },
        { fullName: new RegExp(search, 'i') },
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') },
        { companyName: new RegExp(search, 'i') },
      ];
    }
    const limit = Math.min(Math.max(Number(filter.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const page = Math.max(Number(filter.page) || 1, 1);
    const sortField = filter.sort === 'createdAt' ? 'createdAt' : filter.sort === 'name' ? 'fullName' : 'latestCapturedAt';
    const [items, total] = await Promise.all([
      this.leadModel.find(query).sort({ [sortField]: -1 }).skip((page - 1) * limit).limit(limit).exec(),
      this.leadModel.countDocuments(query).exec(),
    ]);
    return { items: items.map((lead) => this.leadCaptureService.toLeadResponse(lead)), total, page, limit };
  }

  async get(organizationId: string, productId: string, userId: string, leadId: string): Promise<LeadDetailResponse> {
    await this.productsService.findOne(organizationId, productId, userId);
    const lead = await this.findOwned(organizationId, productId, leadId);
    const events = await this.eventModel.find({ leadId: lead._id, organizationId: lead.organizationId, productId: lead.productId }).sort({ occurredAt: 1 }).exec();
    return { ...this.leadCaptureService.toLeadResponse(lead), sourceEvents: events.map((event) => this.leadCaptureService.toEventResponse(event)) };
  }

  async update(organizationId: string, productId: string, userId: string, leadId: string, dto: UpdateLeadDto): Promise<LeadResponse> {
    await this.productsService.findOne(organizationId, productId, userId);
    const lead = await this.findOwned(organizationId, productId, leadId);
    const normalizedEmail = dto.email !== undefined ? this.normalization.normalizeEmail(dto.email) : lead.normalizedEmail;
    const normalizedPhone = dto.phone !== undefined ? this.normalization.normalizePhone(dto.phone) : lead.normalizedPhone;
    if (!normalizedEmail && !normalizedPhone) throw new BadRequestException('Lead requires an email or phone number.');
    if (normalizedEmail && normalizedEmail !== lead.normalizedEmail) await this.assertIdentityAvailable(organizationId, productId, leadId, 'normalizedEmail', normalizedEmail);
    if (normalizedPhone && normalizedPhone !== lead.normalizedPhone) await this.assertIdentityAvailable(organizationId, productId, leadId, 'normalizedPhone', normalizedPhone);

    if (dto.firstName !== undefined) lead.firstName = this.normalization.clean(dto.firstName, 120);
    if (dto.lastName !== undefined) lead.lastName = this.normalization.clean(dto.lastName, 120);
    if (dto.fullName !== undefined) lead.fullName = this.normalization.clean(dto.fullName, 240);
    if (dto.email !== undefined) lead.email = lead.normalizedEmail = normalizedEmail;
    if (dto.phone !== undefined) lead.phone = lead.normalizedPhone = normalizedPhone;
    if (dto.companyName !== undefined) lead.companyName = this.normalization.clean(dto.companyName, 200);
    if (dto.jobTitle !== undefined) lead.jobTitle = this.normalization.clean(dto.jobTitle, 160);
    if (dto.country !== undefined) lead.country = this.normalization.clean(dto.country, 100);
    if (dto.region !== undefined) lead.region = this.normalization.clean(dto.region, 100);
    if (dto.city !== undefined) lead.city = this.normalization.clean(dto.city, 100);
    if (dto.status !== undefined) lead.status = dto.status;
    if (dto.notes !== undefined) lead.notes = this.normalization.normalizeNotes(dto.notes);
    if (dto.customFields !== undefined) lead.customFields = this.normalization.normalizeCustomFields(dto.customFields);
    if (dto.consent) {
      lead.consentStatus = dto.consent.status;
      lead.consentCapturedAt = dto.consent.capturedAt ? new Date(dto.consent.capturedAt) : new Date();
      lead.consentSource = this.normalization.clean(dto.consent.source, 200);
    }
    await lead.save();
    return this.leadCaptureService.toLeadResponse(lead);
  }

  private async findOwned(organizationId: string, productId: string, leadId: string): Promise<LeadDocument> {
    let lead: LeadDocument | null;
    try {
      lead = await this.leadModel.findOne({ _id: new Types.ObjectId(leadId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    } catch {
      throw new NotFoundException('Lead not found.');
    }
    if (!lead) throw new NotFoundException('Lead not found.');
    return lead;
  }

  private async assertIdentityAvailable(organizationId: string, productId: string, leadId: string, field: 'normalizedEmail' | 'normalizedPhone', value: string): Promise<void> {
    const existing = await this.leadModel.findOne({
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      [field]: value,
      _id: { $ne: new Types.ObjectId(leadId) },
    });
    if (existing) throw new ConflictException('Another lead already uses this contact identifier.');
  }
}
