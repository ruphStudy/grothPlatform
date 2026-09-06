import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { ContentVersionDetail } from '../../content-generation/types/content-versioning.types';
import type { SocialPlatform } from '../../social-integrations/types/social.types';
import { SocialSchedule, SocialScheduleDocument } from '../schemas/social-schedule.schema';
import { SocialPublishingService } from './social-publishing.service';
import type { CreateSocialScheduleInput, SocialScheduleListFilter, SocialScheduleResponse, UpdateSocialScheduleInput } from '../types/social-scheduling.types';

const DEFAULT_MIN_LEAD_SECONDS = 60;

/**
 * 19C: stores scheduling intent and runs every deterministic, no-provider-
 * call gate immediate publishing runs (via SocialPublishingService's
 * shared resolveSourceAndPlatform/validatePublishEligibility) — but never
 * calls the provider itself. Execution belongs to 19D's
 * SocialSchedulerService, which calls SocialPublishingService.publish()
 * directly and reuses these exact same gates a second time, fresh, at
 * execution time.
 */
@Injectable()
export class SocialSchedulingService {
  constructor(
    @InjectModel(SocialSchedule.name) private readonly scheduleModel: Model<SocialScheduleDocument>,
    private readonly configService: ConfigService,
    private readonly socialPublishingService: SocialPublishingService,
  ) {}

  async create(input: CreateSocialScheduleInput): Promise<SocialScheduleResponse> {
    const scheduledAt = this.parseAndValidateScheduledAt(input.scheduledAt);
    this.validateTimezone(input.timezone);

    const { sourceVersion, platform } = await this.socialPublishingService.resolveSourceAndPlatform(input.organizationId, input.productId, input.campaignId, input.artifactId, input.version);

    // Fast path (item 10/H): an already-created schedule for the same key
    // is returned as-is.
    const existing = await this.scheduleModel.findOne({
      organizationId: new Types.ObjectId(input.organizationId),
      productId: new Types.ObjectId(input.productId),
      idempotencyKey: input.idempotencyKey,
    });
    if (existing) {
      this.assertSameScheduleRequest(existing, sourceVersion, input);
      return this.toResponse(existing);
    }

    // Cheap deterministic gates only — no provider call (item 7).
    await this.socialPublishingService.validatePublishEligibility(
      { organizationId: input.organizationId, productId: input.productId, campaignId: input.campaignId, connectionId: input.connectionId, creativeAssetId: input.creativeAssetId, userId: input.userId },
      sourceVersion,
      platform,
    );

    let doc: SocialScheduleDocument;
    try {
      doc = await this.createScheduleRecord(input, platform, sourceVersion, scheduledAt);
    } catch {
      const raced = await this.scheduleModel.findOne({
        organizationId: new Types.ObjectId(input.organizationId),
        productId: new Types.ObjectId(input.productId),
        idempotencyKey: input.idempotencyKey,
      });
      if (raced) {
        this.assertSameScheduleRequest(raced, sourceVersion, input);
        return this.toResponse(raced);
      }
      throw new ConflictException('Failed to create the schedule record.');
    }
    return this.toResponse(doc);
  }

  async update(organizationId: string, productId: string, campaignId: string, scheduleId: string, input: UpdateSocialScheduleInput): Promise<SocialScheduleResponse> {
    const doc = await this.findOwned(organizationId, productId, campaignId, scheduleId);
    if (doc.status !== 'scheduled') {
      throw new ConflictException(`Only a scheduled item can be edited (current status: ${doc.status}).`);
    }

    const newScheduledAt = input.scheduledAt !== undefined ? this.parseAndValidateScheduledAt(input.scheduledAt) : doc.scheduledAt;
    if (input.timezone !== undefined) this.validateTimezone(input.timezone);
    const newConnectionId = input.connectionId ?? doc.connectionId.toString();
    const newCreativeAssetId = input.creativeAssetId !== undefined ? input.creativeAssetId : doc.creativeAssetId?.toString();

    const { sourceVersion, platform } = await this.socialPublishingService.resolveSourceAndPlatform(organizationId, productId, campaignId, doc.contentArtifactId.toString(), doc.contentVersion);
    await this.socialPublishingService.validatePublishEligibility(
      { organizationId, productId, campaignId, connectionId: newConnectionId, creativeAssetId: newCreativeAssetId, userId: input.userId },
      sourceVersion,
      platform,
    );

    doc.scheduledAt = newScheduledAt;
    if (input.timezone !== undefined) doc.timezone = input.timezone;
    doc.connectionId = new Types.ObjectId(newConnectionId);
    doc.creativeAssetId = newCreativeAssetId ? new Types.ObjectId(newCreativeAssetId) : undefined;
    await doc.save();
    return this.toResponse(doc);
  }

  async cancel(organizationId: string, productId: string, campaignId: string, scheduleId: string): Promise<SocialScheduleResponse> {
    const doc = await this.findOwned(organizationId, productId, campaignId, scheduleId);
    if (doc.status !== 'scheduled') {
      throw new ConflictException(`Only a scheduled item can be cancelled (current status: ${doc.status}).`);
    }
    doc.status = 'cancelled';
    await doc.save();
    return this.toResponse(doc);
  }

  async list(organizationId: string, productId: string, campaignId: string, filter?: SocialScheduleListFilter): Promise<SocialScheduleResponse[]> {
    const query: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      campaignId: new Types.ObjectId(campaignId),
    };
    if (filter?.status) query.status = filter.status;
    if (filter?.platform) query.platform = filter.platform;
    if (filter?.connectionId) query.connectionId = new Types.ObjectId(filter.connectionId);
    if (filter?.contentArtifactId) query.contentArtifactId = new Types.ObjectId(filter.contentArtifactId);
    if (filter?.from || filter?.to) {
      const range: Record<string, Date> = {};
      if (filter.from) range.$gte = new Date(filter.from);
      if (filter.to) range.$lte = new Date(filter.to);
      query.scheduledAt = range;
    }

    let cursor = this.scheduleModel.find(query).sort({ scheduledAt: 1 });
    if (filter?.limit) cursor = cursor.limit(filter.limit);
    const docs = await cursor.exec();
    return docs.map((d) => this.toResponse(d));
  }

  async get(organizationId: string, productId: string, campaignId: string, scheduleId: string): Promise<SocialScheduleResponse> {
    const doc = await this.findOwned(organizationId, productId, campaignId, scheduleId);
    return this.toResponse(doc);
  }

  // ---------------------------------------------------------------------
  // Validation helpers
  // ---------------------------------------------------------------------

  private parseAndValidateScheduledAt(raw: string): Date {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('scheduledAt must be a valid ISO 8601 date/time.');
    }
    const minLeadSeconds = this.getMinLeadSeconds();
    if (date.getTime() < Date.now() + minLeadSeconds * 1000) {
      throw new BadRequestException(`scheduledAt must be at least ${minLeadSeconds} seconds in the future.`);
    }
    return date;
  }

  // Node's Intl.DateTimeFormat throws a RangeError for a genuinely invalid
  // IANA zone — a cheap, dependency-free validity check.
  private validateTimezone(timezone: string): void {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch {
      throw new BadRequestException(`${timezone} is not a valid IANA timezone.`);
    }
  }

  // Item 10/11: reusing the same idempotency key for genuinely different
  // content/connection/creative is a conflict, not a silent duplicate.
  private assertSameScheduleRequest(existing: SocialScheduleDocument, sourceVersion: ContentVersionDetail, input: CreateSocialScheduleInput): void {
    const sameContent = existing.contentVersionId.toString() === sourceVersion.id;
    const sameConnection = existing.connectionId.toString() === input.connectionId;
    const sameCreative = (existing.creativeAssetId?.toString() ?? undefined) === (input.creativeAssetId ?? undefined);
    if (!sameContent || !sameConnection || !sameCreative) {
      throw new ConflictException('This idempotency key was already used for a different schedule request.');
    }
  }

  private async createScheduleRecord(input: CreateSocialScheduleInput, platform: SocialPlatform, sourceVersion: ContentVersionDetail, scheduledAt: Date): Promise<SocialScheduleDocument> {
    const doc = new this.scheduleModel({
      organizationId: new Types.ObjectId(input.organizationId),
      productId: new Types.ObjectId(input.productId),
      campaignId: new Types.ObjectId(input.campaignId),
      contentArtifactId: new Types.ObjectId(input.artifactId),
      contentVersionId: new Types.ObjectId(sourceVersion.id),
      contentVersion: sourceVersion.version,
      platform,
      connectionId: new Types.ObjectId(input.connectionId),
      creativeAssetId: input.creativeAssetId ? new Types.ObjectId(input.creativeAssetId) : undefined,
      scheduledAt,
      timezone: input.timezone,
      status: 'scheduled',
      idempotencyKey: input.idempotencyKey,
      attemptCount: 0,
      createdBy: new Types.ObjectId(input.userId),
    });
    await doc.save();
    return doc;
  }

  private async findOwned(organizationId: string, productId: string, campaignId: string, scheduleId: string): Promise<SocialScheduleDocument> {
    let doc: SocialScheduleDocument | null;
    try {
      doc = await this.scheduleModel.findOne({
        _id: new Types.ObjectId(scheduleId),
        organizationId: new Types.ObjectId(organizationId),
        productId: new Types.ObjectId(productId),
        campaignId: new Types.ObjectId(campaignId),
      });
    } catch {
      throw new NotFoundException('Social schedule not found.');
    }
    if (!doc) throw new NotFoundException('Social schedule not found.');
    return doc;
  }

  private getMinLeadSeconds(): number {
    const value = this.configService.get<string>('SOCIAL_SCHEDULE_MIN_LEAD_SECONDS');
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MIN_LEAD_SECONDS;
  }

  private toResponse(doc: SocialScheduleDocument): SocialScheduleResponse {
    return {
      id: doc._id.toString(),
      platform: doc.platform,
      connectionId: doc.connectionId.toString(),
      contentArtifactId: doc.contentArtifactId.toString(),
      contentVersionId: doc.contentVersionId.toString(),
      contentVersion: doc.contentVersion,
      creativeAssetId: doc.creativeAssetId?.toString(),
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
