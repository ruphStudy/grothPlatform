import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProductsService } from '../../products/products.service';
import { CreateCrmPipelineDto, CreateCrmStageDto, ReorderCrmStagesDto, UpdateCrmPipelineDto, UpdateCrmStageDto } from '../dto/crm.dto';
import { CrmOpportunity, CrmOpportunityDocument } from '../schemas/crm-opportunity.schema';
import { CrmPipeline, CrmPipelineDocument } from '../schemas/crm-pipeline.schema';
import { CrmStage, CrmStageDocument } from '../schemas/crm-stage.schema';
import { CRM_STAGE_CATEGORIES } from '../types/crm.types';
import type { CrmStageCategory } from '../types/crm.types';

export const DEFAULT_CRM_STAGES: { name: string; key: string; order: number; category: CrmStageCategory; probability: number }[] = [
  { name: 'New Opportunity', key: 'new-opportunity', order: 10, category: 'open', probability: 10 },
  { name: 'Qualified', key: 'qualified', order: 20, category: 'open', probability: 25 },
  { name: 'Contacted', key: 'contacted', order: 30, category: 'open', probability: 35 },
  { name: 'Demo / Meeting', key: 'demo-meeting', order: 40, category: 'open', probability: 50 },
  { name: 'Proposal', key: 'proposal', order: 50, category: 'open', probability: 70 },
  { name: 'Negotiation', key: 'negotiation', order: 60, category: 'open', probability: 85 },
  { name: 'Won', key: 'won', order: 70, category: 'won', probability: 100 },
  { name: 'Lost', key: 'lost', order: 80, category: 'lost', probability: 0 },
];

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pipeline';
}

@Injectable()
export class CrmPipelineService {
  constructor(
    @InjectModel(CrmPipeline.name) private readonly pipelineModel: Model<CrmPipelineDocument>,
    @InjectModel(CrmStage.name) private readonly stageModel: Model<CrmStageDocument>,
    @InjectModel(CrmOpportunity.name) private readonly opportunityModel: Model<CrmOpportunityDocument>,
    private readonly productsService: ProductsService,
  ) {}

  async ensureDefaultPipeline(organizationId: string, productId: string, userId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    let pipeline = await this.pipelineModel.findOne({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), isDefault: true, isActive: true }).exec();
    if (!pipeline) {
      pipeline = await new this.pipelineModel({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), name: 'Default Pipeline', slug: await this.uniqueSlug(organizationId, productId, 'default-pipeline'), isDefault: true, isActive: true }).save();
    }
    for (const stage of DEFAULT_CRM_STAGES) {
      await this.stageModel.updateOne({ organizationId: pipeline.organizationId, productId: pipeline.productId, pipelineId: pipeline._id, key: stage.key }, { $setOnInsert: { ...stage, organizationId: pipeline.organizationId, productId: pipeline.productId, pipelineId: pipeline._id, isActive: true } }, { upsert: true }).exec();
    }
    const stages = await this.listStageDocs(organizationId, productId, pipeline._id.toString(), true);
    return { pipeline: this.toPipelineResponse(pipeline), stages: stages.map((stage) => this.toStageResponse(stage)) };
  }

  async listPipelines(organizationId: string, productId: string, userId: string) {
    await this.ensureDefaultPipeline(organizationId, productId, userId);
    const pipelines = await this.pipelineModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).sort({ isDefault: -1, createdAt: 1 }).exec();
    return Promise.all(pipelines.map(async (pipeline) => ({ ...this.toPipelineResponse(pipeline), stages: (await this.listStageDocs(organizationId, productId, pipeline._id.toString(), false)).map((stage) => this.toStageResponse(stage)) })));
  }

  async getPipeline(organizationId: string, productId: string, userId: string, pipelineId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    const pipeline = await this.findPipelineDoc(organizationId, productId, pipelineId);
    return { ...this.toPipelineResponse(pipeline), stages: (await this.listStageDocs(organizationId, productId, pipelineId, false)).map((stage) => this.toStageResponse(stage)) };
  }

  async createPipeline(organizationId: string, productId: string, userId: string, dto: CreateCrmPipelineDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const pipeline = await new this.pipelineModel({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), name: dto.name.trim(), slug: await this.uniqueSlug(organizationId, productId, slugify(dto.name)), description: dto.description, isDefault: Boolean(dto.isDefault), isActive: true }).save();
    if (pipeline.isDefault) await this.clearOtherDefaults(organizationId, productId, pipeline._id);
    return this.toPipelineResponse(pipeline);
  }

  async updatePipeline(organizationId: string, productId: string, userId: string, pipelineId: string, dto: UpdateCrmPipelineDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const pipeline = await this.findPipelineDoc(organizationId, productId, pipelineId);
    if (dto.name !== undefined) {
      pipeline.name = dto.name.trim();
      pipeline.slug = await this.uniqueSlug(organizationId, productId, slugify(dto.name), pipelineId);
    }
    if (dto.description !== undefined) pipeline.description = dto.description;
    if (dto.isDefault !== undefined) pipeline.isDefault = dto.isDefault;
    if (dto.isActive !== undefined) {
      if (!dto.isActive && pipeline.isDefault) throw new BadRequestException('crm_pipeline_inactive');
      pipeline.isActive = dto.isActive;
    }
    await pipeline.save();
    if (pipeline.isDefault) await this.clearOtherDefaults(organizationId, productId, pipeline._id);
    return this.toPipelineResponse(pipeline);
  }

  async createStage(organizationId: string, productId: string, userId: string, pipelineId: string, dto: CreateCrmStageDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const pipeline = await this.findPipelineDoc(organizationId, productId, pipelineId);
    if (!pipeline.isActive) throw new BadRequestException('crm_pipeline_inactive');
    this.validateStage(dto.category, dto.probability, dto.order);
    await this.assertOrderFree(organizationId, productId, pipelineId, dto.order);
    const stage = await new this.stageModel({ organizationId: pipeline.organizationId, productId: pipeline.productId, pipelineId: pipeline._id, name: dto.name.trim(), key: await this.uniqueStageKey(organizationId, productId, pipelineId, slugify(dto.name)), order: dto.order, category: dto.category, probability: dto.probability, isActive: true }).save();
    return this.toStageResponse(stage);
  }

  async updateStage(organizationId: string, productId: string, userId: string, stageId: string, dto: UpdateCrmStageDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    const stage = await this.findStageDoc(organizationId, productId, stageId);
    this.validateStage(dto.category ?? stage.category, dto.probability ?? stage.probability, dto.order ?? stage.order);
    if (dto.order !== undefined && dto.order !== stage.order) await this.assertOrderFree(organizationId, productId, stage.pipelineId.toString(), dto.order, stageId);
    if (dto.name !== undefined) stage.name = dto.name.trim();
    if (dto.category !== undefined) stage.category = dto.category;
    if (dto.order !== undefined) stage.order = dto.order;
    if (dto.probability !== undefined) stage.probability = dto.probability;
    if (dto.isActive !== undefined) {
      if (!dto.isActive) await this.assertPipelineUsableAfterStageChange(organizationId, productId, stage);
      stage.isActive = dto.isActive;
    }
    await stage.save();
    return this.toStageResponse(stage);
  }

  async reorderStages(organizationId: string, productId: string, userId: string, pipelineId: string, dto: ReorderCrmStagesDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    await this.findPipelineDoc(organizationId, productId, pipelineId);
    const stages = await this.listStageDocs(organizationId, productId, pipelineId, false);
    if (stages.length !== dto.stageIds.length || new Set(dto.stageIds).size !== dto.stageIds.length) throw new BadRequestException('crm_invalid_stage_order');
    const known = new Set(stages.map((stage) => stage._id.toString()));
    if (!dto.stageIds.every((id) => known.has(id))) throw new BadRequestException('crm_invalid_stage_order');
    for (const [index, stageId] of dto.stageIds.entries()) await this.stageModel.updateOne({ _id: new Types.ObjectId(stageId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }, { order: (index + 1) * 10 }).exec();
    return (await this.listStageDocs(organizationId, productId, pipelineId, false)).map((stage) => this.toStageResponse(stage));
  }

  async findPipelineDoc(organizationId: string, productId: string, pipelineId: string): Promise<CrmPipelineDocument> {
    if (!Types.ObjectId.isValid(pipelineId)) throw new NotFoundException('crm_pipeline_not_found');
    const pipeline = await this.pipelineModel.findOne({ _id: new Types.ObjectId(pipelineId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (!pipeline) throw new NotFoundException('crm_pipeline_not_found');
    return pipeline;
  }

  async findStageDoc(organizationId: string, productId: string, stageId: string): Promise<CrmStageDocument> {
    if (!Types.ObjectId.isValid(stageId)) throw new NotFoundException('crm_stage_not_found');
    const stage = await this.stageModel.findOne({ _id: new Types.ObjectId(stageId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (!stage) throw new NotFoundException('crm_stage_not_found');
    return stage;
  }

  async resolvePipelineAndStage(organizationId: string, productId: string, userId: string, pipelineId?: string, stageId?: string) {
    const initialized = pipelineId ? null : await this.ensureDefaultPipeline(organizationId, productId, userId);
    const resolvedPipelineId = pipelineId ?? initialized!.pipeline.id;
    const pipeline = await this.findPipelineDoc(organizationId, productId, resolvedPipelineId);
    if (!pipeline.isActive) throw new BadRequestException('crm_pipeline_inactive');
    const stage = stageId ? await this.findStageDoc(organizationId, productId, stageId) : await this.stageModel.findOne({ organizationId: pipeline.organizationId, productId: pipeline.productId, pipelineId: pipeline._id, category: 'open', isActive: true }).sort({ order: 1 }).exec();
    if (!stage) throw new NotFoundException('crm_stage_not_found');
    if (!stage.pipelineId.equals(pipeline._id)) throw new BadRequestException('crm_stage_pipeline_mismatch');
    if (!stage.isActive) throw new BadRequestException('crm_stage_inactive');
    if (stage.category !== 'open') throw new BadRequestException('crm_invalid_stage_transition');
    return { pipeline, stage };
  }

  async findTerminalStage(organizationId: string, productId: string, pipelineId: string, category: 'won' | 'lost') {
    const stage = await this.stageModel.findOne({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), pipelineId: new Types.ObjectId(pipelineId), category, isActive: true }).sort({ order: 1 }).exec();
    if (!stage) throw new NotFoundException('crm_stage_not_found');
    return stage;
  }

  async listStageDocs(organizationId: string, productId: string, pipelineId: string, activeOnly: boolean) {
    return this.stageModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), pipelineId: new Types.ObjectId(pipelineId), ...(activeOnly ? { isActive: true } : {}) }).sort({ order: 1 }).exec();
  }

  toPipelineResponse(pipeline: CrmPipelineDocument) {
    return { id: pipeline._id.toString(), organizationId: pipeline.organizationId.toString(), productId: pipeline.productId.toString(), name: pipeline.name, slug: pipeline.slug, description: pipeline.description, isDefault: pipeline.isDefault, isActive: pipeline.isActive, createdAt: pipeline.createdAt, updatedAt: pipeline.updatedAt };
  }

  toStageResponse(stage: CrmStageDocument) {
    return { id: stage._id.toString(), organizationId: stage.organizationId.toString(), productId: stage.productId.toString(), pipelineId: stage.pipelineId.toString(), name: stage.name, key: stage.key, order: stage.order, category: stage.category, probability: stage.probability, isActive: stage.isActive, createdAt: stage.createdAt, updatedAt: stage.updatedAt };
  }

  private validateStage(category: CrmStageCategory, probability: number | undefined, order: number): void {
    if (!CRM_STAGE_CATEGORIES.includes(category) || order < 1 || !Number.isInteger(order)) throw new BadRequestException('crm_invalid_stage_order');
    if (probability !== undefined && (probability < 0 || probability > 100)) throw new BadRequestException('crm_invalid_probability');
  }

  private async assertPipelineUsableAfterStageChange(organizationId: string, productId: string, stage: CrmStageDocument): Promise<void> {
    const inUse = await this.opportunityModel.exists({ organizationId: stage.organizationId, productId: stage.productId, stageId: stage._id });
    if (inUse) return;
    const counts = await this.stageModel.aggregate([{ $match: { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), pipelineId: stage.pipelineId, isActive: true, _id: { $ne: stage._id } } }, { $group: { _id: '$category', count: { $sum: 1 } } }]).exec();
    const map = new Map(counts.map((item) => [item._id, item.count]));
    if (!map.get('open') || !map.get('won') || !map.get('lost')) throw new BadRequestException('crm_invalid_stage_transition');
  }

  private async assertOrderFree(organizationId: string, productId: string, pipelineId: string, order: number, excludeStageId?: string) {
    const existing = await this.stageModel.exists({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), pipelineId: new Types.ObjectId(pipelineId), order, ...(excludeStageId ? { _id: { $ne: new Types.ObjectId(excludeStageId) } } : {}) });
    if (existing) throw new ConflictException('crm_invalid_stage_order');
  }

  private async uniqueSlug(organizationId: string, productId: string, base: string, excludeId?: string) {
    let slug = base;
    let counter = 2;
    while (await this.pipelineModel.exists({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), slug, ...(excludeId ? { _id: { $ne: new Types.ObjectId(excludeId) } } : {}) })) slug = `${base}-${counter++}`;
    return slug;
  }

  private async uniqueStageKey(organizationId: string, productId: string, pipelineId: string, base: string) {
    let key = base;
    let counter = 2;
    while (await this.stageModel.exists({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), pipelineId: new Types.ObjectId(pipelineId), key })) key = `${base}-${counter++}`;
    return key;
  }

  private async clearOtherDefaults(organizationId: string, productId: string, pipelineId: Types.ObjectId) {
    await this.pipelineModel.updateMany({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), _id: { $ne: pipelineId } }, { isDefault: false }).exec();
  }
}
