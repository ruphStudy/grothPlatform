import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CmsSchedule, CmsScheduleDocument } from '../schemas/cms-schedule.schema';
import { CmsPublicationsService } from './cms-publications.service';
import type { CreateCmsScheduleInput, CmsScheduleListFilter, CmsScheduleResponse, UpdateCmsScheduleInput } from '../types/cms-scheduling.types';

const DEFAULT_MIN_LEAD_SECONDS = 60;

@Injectable()
export class CmsSchedulingService {
  constructor(
    @InjectModel(CmsSchedule.name) private readonly scheduleModel: Model<CmsScheduleDocument>,
    private readonly configService: ConfigService,
    private readonly cmsPublicationsService: CmsPublicationsService,
  ) {}

  async create(input: CreateCmsScheduleInput): Promise<CmsScheduleResponse> {
    const scheduledAt = this.parseAndValidateScheduledAt(input.scheduledAt);
    this.validateTimezone(input.timezone);
    const intent = await this.cmsPublicationsService.validateBlogPublicationIntent(input.organizationId, input.productId, input.campaignId, input.artifactId, input.version, input.userId, {
      connectionId: input.connectionId,
      mode: input.mode,
      idempotencyKey: input.idempotencyKey,
      featuredCreativeAssetId: input.featuredCreativeAssetId,
      categoryIds: input.categoryIds,
      tagIds: input.tagIds,
    });

    const existing = await this.scheduleModel.findOne({
      organizationId: new Types.ObjectId(input.organizationId),
      productId: new Types.ObjectId(input.productId),
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) {
      this.assertSameScheduleRequest(existing, intent.sourceVersion.id, input, scheduledAt);
      return this.toResponse(existing);
    }

    let doc: CmsScheduleDocument;
    try {
      doc = await new this.scheduleModel({
        organizationId: new Types.ObjectId(input.organizationId),
        productId: new Types.ObjectId(input.productId),
        campaignId: new Types.ObjectId(input.campaignId),
        cmsConnectionId: new Types.ObjectId(input.connectionId),
        contentArtifactId: new Types.ObjectId(input.artifactId),
        contentVersionId: new Types.ObjectId(intent.sourceVersion.id),
        contentVersion: intent.sourceVersion.version,
        platform: 'wordpress',
        publishMode: input.mode,
        featuredCreativeAssetId: input.featuredCreativeAssetId ? new Types.ObjectId(input.featuredCreativeAssetId) : undefined,
        categoryIds: intent.categoryIds,
        tagIds: intent.tagIds,
        scheduledAt,
        timezone: input.timezone,
        status: 'scheduled',
        idempotencyKey: input.idempotencyKey,
        attemptCount: 0,
        createdBy: new Types.ObjectId(input.userId),
      }).save();
    } catch {
      const raced = await this.scheduleModel.findOne({
        organizationId: new Types.ObjectId(input.organizationId),
        productId: new Types.ObjectId(input.productId),
        idempotencyKey: input.idempotencyKey,
      });
      if (raced) {
        this.assertSameScheduleRequest(raced, intent.sourceVersion.id, input, scheduledAt);
        return this.toResponse(raced);
      }
      throw new ConflictException('Failed to create the CMS schedule record.');
    }
    return this.toResponse(doc);
  }

  async update(organizationId: string, productId: string, campaignId: string, scheduleId: string, input: UpdateCmsScheduleInput): Promise<CmsScheduleResponse> {
    const doc = await this.findOwned(organizationId, productId, campaignId, scheduleId);
    if (doc.status !== 'scheduled') {
      throw new ConflictException(`Only a scheduled CMS item can be edited (current status: ${doc.status}).`);
    }
    const scheduledAt = input.scheduledAt !== undefined ? this.parseAndValidateScheduledAt(input.scheduledAt) : doc.scheduledAt;
    const timezone = input.timezone ?? doc.timezone;
    this.validateTimezone(timezone);
    const connectionId = input.connectionId ?? doc.cmsConnectionId.toString();
    const mode = input.mode ?? doc.publishMode;
    const featuredCreativeAssetId = input.featuredCreativeAssetId !== undefined ? input.featuredCreativeAssetId : doc.featuredCreativeAssetId?.toString();
    const categoryIds = input.categoryIds ?? doc.categoryIds;
    const tagIds = input.tagIds ?? doc.tagIds;
    const intent = await this.cmsPublicationsService.validateBlogPublicationIntent(organizationId, productId, campaignId, doc.contentArtifactId.toString(), doc.contentVersion, input.userId, {
      connectionId,
      mode,
      idempotencyKey: `cms-schedule-validation:${doc._id.toString()}`,
      featuredCreativeAssetId,
      categoryIds,
      tagIds,
    });

    doc.scheduledAt = scheduledAt;
    doc.timezone = timezone;
    doc.cmsConnectionId = new Types.ObjectId(connectionId);
    doc.publishMode = mode;
    doc.featuredCreativeAssetId = featuredCreativeAssetId ? new Types.ObjectId(featuredCreativeAssetId) : undefined;
    doc.categoryIds = intent.categoryIds;
    doc.tagIds = intent.tagIds;
    await doc.save();
    return this.toResponse(doc);
  }

  async cancel(organizationId: string, productId: string, campaignId: string, scheduleId: string): Promise<CmsScheduleResponse> {
    const doc = await this.findOwned(organizationId, productId, campaignId, scheduleId);
    if (doc.status !== 'scheduled') {
      throw new ConflictException(`Only a scheduled CMS item can be cancelled (current status: ${doc.status}).`);
    }
    doc.status = 'cancelled';
    await doc.save();
    return this.toResponse(doc);
  }

  async list(organizationId: string, productId: string, campaignId: string, filter?: CmsScheduleListFilter): Promise<CmsScheduleResponse[]> {
    const query: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      campaignId: new Types.ObjectId(campaignId),
    };
    if (filter?.status) query.status = filter.status;
    if (filter?.mode) query.publishMode = filter.mode;
    if (filter?.connectionId) query.cmsConnectionId = new Types.ObjectId(filter.connectionId);
    if (filter?.start || filter?.end) {
      const range: Record<string, Date> = {};
      if (filter.start) range.$gte = new Date(filter.start);
      if (filter.end) range.$lte = new Date(filter.end);
      query.scheduledAt = range;
    }
    const docs = await this.scheduleModel.find(query).sort({ scheduledAt: 1 }).exec();
    return docs.map((doc) => this.toResponse(doc));
  }

  async get(organizationId: string, productId: string, campaignId: string, scheduleId: string): Promise<CmsScheduleResponse> {
    return this.toResponse(await this.findOwned(organizationId, productId, campaignId, scheduleId));
  }

  private parseAndValidateScheduledAt(raw: string): Date {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('scheduledAt must be a valid ISO 8601 date/time.');
    const minLeadSeconds = this.getMinLeadSeconds();
    if (date.getTime() < Date.now() + minLeadSeconds * 1000) throw new BadRequestException(`scheduledAt must be at least ${minLeadSeconds} seconds in the future.`);
    return date;
  }

  private validateTimezone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch {
      throw new BadRequestException(`${timezone} is not a valid IANA timezone.`);
    }
  }

  private assertSameScheduleRequest(existing: CmsScheduleDocument, sourceVersionId: string, input: CreateCmsScheduleInput, scheduledAt: Date): void {
    const sameContent = existing.contentVersionId.toString() === sourceVersionId;
    const sameConnection = existing.cmsConnectionId.toString() === input.connectionId;
    const sameMode = existing.publishMode === input.mode;
    const sameScheduledAt = existing.scheduledAt.getTime() === scheduledAt.getTime();
    const sameTimezone = existing.timezone === input.timezone;
    const sameCreative = (existing.featuredCreativeAssetId?.toString() ?? undefined) === (input.featuredCreativeAssetId ?? undefined);
    const sameCategories = this.sameNumberList(existing.categoryIds, input.categoryIds ?? []);
    const sameTags = this.sameNumberList(existing.tagIds, input.tagIds ?? []);
    if (!sameContent || !sameConnection || !sameMode || !sameScheduledAt || !sameTimezone || !sameCreative || !sameCategories || !sameTags) {
      throw new ConflictException('This idempotency key was already used for a different CMS schedule request.');
    }
  }

  private async findOwned(organizationId: string, productId: string, campaignId: string, scheduleId: string): Promise<CmsScheduleDocument> {
    let doc: CmsScheduleDocument | null;
    try {
      doc = await this.scheduleModel.findOne({
        _id: new Types.ObjectId(scheduleId),
        organizationId: new Types.ObjectId(organizationId),
        productId: new Types.ObjectId(productId),
        campaignId: new Types.ObjectId(campaignId),
      });
    } catch {
      throw new NotFoundException('CMS schedule not found.');
    }
    if (!doc) throw new NotFoundException('CMS schedule not found.');
    return doc;
  }

  private getMinLeadSeconds(): number {
    const value = this.configService.get<string>('CMS_SCHEDULE_MIN_LEAD_SECONDS');
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MIN_LEAD_SECONDS;
  }

  private sameNumberList(a: number[], b: number[]): boolean {
    const left = [...a].sort((x, y) => x - y);
    const right = [...b].sort((x, y) => x - y);
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  private toResponse(doc: CmsScheduleDocument): CmsScheduleResponse {
    return {
      id: doc._id.toString(),
      platform: doc.platform,
      cmsConnectionId: doc.cmsConnectionId.toString(),
      contentArtifactId: doc.contentArtifactId.toString(),
      contentVersionId: doc.contentVersionId.toString(),
      contentVersion: doc.contentVersion,
      publishMode: doc.publishMode,
      featuredCreativeAssetId: doc.featuredCreativeAssetId?.toString(),
      categoryIds: doc.categoryIds ?? [],
      tagIds: doc.tagIds ?? [],
      scheduledAt: doc.scheduledAt,
      timezone: doc.timezone,
      status: doc.status,
      publicationId: doc.publicationId?.toString(),
      attemptCount: doc.attemptCount,
      lastAttemptAt: doc.lastAttemptAt,
      errorCode: doc.errorCode,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
