import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProductsService } from '../products/products.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { Campaign, CampaignDocument } from './schemas/campaign.schema';
import type { CampaignResponse } from './types/campaign.types';

const MAX_ARRAY_ITEMS = 50;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeIdArray(items: string[] | undefined): string[] {
  if (!items) return [];
  const cleaned = items.map((i) => i.trim()).filter((i) => i.length > 0);
  return Array.from(new Set(cleaned)).slice(0, MAX_ARRAY_ITEMS);
}

export interface CampaignListFilters {
  status?: string;
  type?: string;
}

/**
 * Deterministic persistence/CRUD only — deliberately kept separate from any
 * future strategy-driven campaign-generation logic (a later
 * CampaignPlanningService), which will build on top of this model rather
 * than being mixed into it.
 */
@Injectable()
export class CampaignsService {
  constructor(
    @InjectModel(Campaign.name) private readonly campaignModel: Model<CampaignDocument>,
    private readonly productsService: ProductsService,
  ) {}

  async create(organizationId: string, productId: string, userId: string, dto: CreateCampaignDto): Promise<CampaignResponse> {
    await this.productsService.findOne(organizationId, productId, userId);
    this.validateDateRange(dto.startDate, dto.endDate);

    const baseSlug = slugify(dto.name);
    const slug = await this.ensureUniqueSlug(organizationId, productId, baseSlug);

    const campaign = await new this.campaignModel({
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      name: dto.name,
      slug,
      description: dto.description,
      status: 'draft',
      type: dto.type,
      objectiveIds: normalizeIdArray(dto.objectiveIds),
      channelIds: normalizeIdArray(dto.channelIds),
      audienceSegmentIds: normalizeIdArray(dto.audienceSegmentIds),
      funnelStages: normalizeIdArray(dto.funnelStages),
      messagingPillarIds: normalizeIdArray(dto.messagingPillarIds),
      contentPillarIds: normalizeIdArray(dto.contentPillarIds),
      acquisitionMotionIds: normalizeIdArray(dto.acquisitionMotionIds),
      conversionActionIds: normalizeIdArray(dto.conversionActionIds),
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      planningMetadata: { source: 'manual', version: 1 },
      createdBy: new Types.ObjectId(userId),
    }).save();

    return this.toResponse(campaign);
  }

  async findAll(organizationId: string, productId: string, userId: string, filters: CampaignListFilters): Promise<CampaignResponse[]> {
    await this.productsService.findOne(organizationId, productId, userId);

    const query: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
    };
    if (filters.status) query.status = filters.status;
    if (filters.type) query.type = filters.type;

    const campaigns = await this.campaignModel.find(query).sort({ createdAt: -1 }).exec();
    return campaigns.map((c) => this.toResponse(c));
  }

  async findOne(organizationId: string, productId: string, campaignId: string, userId: string): Promise<CampaignResponse> {
    await this.productsService.findOne(organizationId, productId, userId);
    const campaign = await this.findCampaignDoc(organizationId, productId, campaignId);
    return this.toResponse(campaign);
  }

  async update(organizationId: string, productId: string, campaignId: string, userId: string, dto: UpdateCampaignDto): Promise<CampaignResponse> {
    await this.productsService.findOne(organizationId, productId, userId);
    const campaign = await this.findCampaignDoc(organizationId, productId, campaignId);

    const nextStart = dto.startDate !== undefined ? dto.startDate : campaign.startDate?.toISOString();
    const nextEnd = dto.endDate !== undefined ? dto.endDate : campaign.endDate?.toISOString();
    this.validateDateRange(nextStart, nextEnd);

    if (dto.name !== undefined && dto.name !== campaign.name) {
      const baseSlug = slugify(dto.name);
      campaign.slug = await this.ensureUniqueSlug(organizationId, productId, baseSlug, String(campaign._id));
      campaign.name = dto.name;
    }
    if (dto.description !== undefined) campaign.description = dto.description;
    if (dto.type !== undefined) campaign.type = dto.type;
    if (dto.status !== undefined) campaign.status = dto.status;
    if (dto.startDate !== undefined) campaign.startDate = dto.startDate ? new Date(dto.startDate) : undefined;
    if (dto.endDate !== undefined) campaign.endDate = dto.endDate ? new Date(dto.endDate) : undefined;
    if (dto.objectiveIds !== undefined) campaign.objectiveIds = normalizeIdArray(dto.objectiveIds);
    if (dto.channelIds !== undefined) campaign.channelIds = normalizeIdArray(dto.channelIds);
    if (dto.audienceSegmentIds !== undefined) campaign.audienceSegmentIds = normalizeIdArray(dto.audienceSegmentIds);
    if (dto.funnelStages !== undefined) campaign.funnelStages = normalizeIdArray(dto.funnelStages);
    if (dto.messagingPillarIds !== undefined) campaign.messagingPillarIds = normalizeIdArray(dto.messagingPillarIds);
    if (dto.contentPillarIds !== undefined) campaign.contentPillarIds = normalizeIdArray(dto.contentPillarIds);
    if (dto.acquisitionMotionIds !== undefined) campaign.acquisitionMotionIds = normalizeIdArray(dto.acquisitionMotionIds);
    if (dto.conversionActionIds !== undefined) campaign.conversionActionIds = normalizeIdArray(dto.conversionActionIds);

    campaign.updatedBy = new Types.ObjectId(userId);
    await campaign.save();
    return this.toResponse(campaign);
  }

  // ---------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------

  private validateDateRange(startDate?: string, endDate?: string): void {
    if (!startDate || !endDate) return;
    if (new Date(endDate).getTime() < new Date(startDate).getTime()) {
      throw new BadRequestException('endDate must not be before startDate.');
    }
  }

  private async ensureUniqueSlug(organizationId: string, productId: string, base: string, excludeId?: string): Promise<string> {
    let slug = base || 'campaign';
    let counter = 2;
    while (
      await this.campaignModel.exists({
        organizationId: new Types.ObjectId(organizationId),
        productId: new Types.ObjectId(productId),
        slug,
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
    ) {
      slug = `${base || 'campaign'}-${counter}`;
      counter += 1;
    }
    return slug;
  }

  private async findCampaignDoc(organizationId: string, productId: string, campaignId: string): Promise<CampaignDocument> {
    if (!Types.ObjectId.isValid(campaignId)) {
      throw new NotFoundException('Campaign not found');
    }
    const campaign = await this.campaignModel
      .findOne({
        _id: campaignId,
        organizationId: new Types.ObjectId(organizationId),
        productId: new Types.ObjectId(productId),
      })
      .exec();
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  private toResponse(campaign: CampaignDocument): CampaignResponse {
    return {
      id: campaign._id.toString(),
      organizationId: campaign.organizationId.toString(),
      productId: campaign.productId.toString(),
      name: campaign.name,
      slug: campaign.slug,
      description: campaign.description,
      status: campaign.status,
      type: campaign.type,
      objectiveIds: campaign.objectiveIds,
      channelIds: campaign.channelIds,
      audienceSegmentIds: campaign.audienceSegmentIds,
      funnelStages: campaign.funnelStages,
      messagingPillarIds: campaign.messagingPillarIds,
      contentPillarIds: campaign.contentPillarIds,
      acquisitionMotionIds: campaign.acquisitionMotionIds,
      conversionActionIds: campaign.conversionActionIds,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      strategyReference: campaign.strategyReference
        ? {
            reviewedStrategyGeneratedAt: campaign.strategyReference.reviewedStrategyGeneratedAt,
            strategyReviewId: campaign.strategyReference.strategyReviewId?.toString(),
          }
        : undefined,
      planningMetadata: {
        source: campaign.planningMetadata.source,
        version: campaign.planningMetadata.version,
      },
      createdBy: campaign.createdBy.toString(),
      updatedBy: campaign.updatedBy?.toString(),
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    };
  }
}
