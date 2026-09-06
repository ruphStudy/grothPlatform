import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SocialConnectionsService } from '../../social-integrations/connections/services/social-connections.service';
import type { SocialConnectionResponse } from '../../social-integrations/connections/types/social-connection.types';
import { SocialPublication, SocialPublicationDocument } from '../schemas/social-publication.schema';
import type { PublicationStatus } from '../schemas/social-publication.schema';
import { SocialSchedule, SocialScheduleDocument } from '../schemas/social-schedule.schema';
import type { PublishingCalendarItem, PublishingCalendarQuery, PublishingCalendarStatus } from '../types/publishing-calendar.types';

const DEFAULT_MAX_RANGE_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function toProcessingBucket(status: PublicationStatus): PublishingCalendarStatus {
  if (status === 'pending' || status === 'publishing') return 'processing';
  return status; // 'published' | 'failed'
}

function normalizedStatusToPublicationStatuses(status: PublishingCalendarStatus): PublicationStatus[] {
  if (status === 'processing') return ['pending', 'publishing'];
  if (status === 'published') return ['published'];
  if (status === 'failed') return ['failed'];
  return []; // 'scheduled' | 'cancelled' never apply to a raw SocialPublication
}

/**
 * 19E: a read-only management/view layer combining SocialSchedule +
 * SocialPublication into one normalized, date-bounded feed. Never
 * schedules or publishes anything itself, never calls a social provider.
 * A schedule that has already produced a publication is represented as
 * ONE item carrying both `scheduleId` and `publicationId` — the matching
 * SocialPublication is excluded from the separate "immediate publication"
 * query so it is never also returned as a second item.
 */
@Injectable()
export class PublishingCalendarService {
  constructor(
    @InjectModel(SocialSchedule.name) private readonly scheduleModel: Model<SocialScheduleDocument>,
    @InjectModel(SocialPublication.name) private readonly publicationModel: Model<SocialPublicationDocument>,
    private readonly configService: ConfigService,
    private readonly socialConnectionsService: SocialConnectionsService,
  ) {}

  async getCalendar(organizationId: string, productId: string, campaignId: string, query: PublishingCalendarQuery): Promise<PublishingCalendarItem[]> {
    const { start, end } = this.parseRange(query.start, query.end);

    const scheduleQuery: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      campaignId: new Types.ObjectId(campaignId),
      scheduledAt: { $gte: start, $lte: end },
    };
    if (query.platform) scheduleQuery.platform = query.platform;
    if (query.connectionId) scheduleQuery.connectionId = new Types.ObjectId(query.connectionId);
    if (query.status) scheduleQuery.status = query.status; // literal overlap: same 5 values

    const schedules = await this.scheduleModel.find(scheduleQuery).sort({ scheduledAt: 1 }).exec();

    const linkedPublicationIds = schedules.filter((s) => s.status === 'published' && s.publicationId).map((s) => s.publicationId as Types.ObjectId);
    const linkedPublications = linkedPublicationIds.length > 0 ? await this.publicationModel.find({ _id: { $in: linkedPublicationIds } }).exec() : [];
    const linkedPublicationById = new Map(linkedPublications.map((p) => [p._id.toString(), p]));

    let publications: SocialPublicationDocument[] = [];
    const pubStatuses = query.status ? normalizedStatusToPublicationStatuses(query.status) : undefined;
    if (!query.status || pubStatuses!.length > 0) {
      const pubQuery: Record<string, unknown> = {
        organizationId: new Types.ObjectId(organizationId),
        productId: new Types.ObjectId(productId),
        campaignId: new Types.ObjectId(campaignId),
        $or: [{ publishedAt: { $gte: start, $lte: end } }, { publishedAt: { $exists: false }, createdAt: { $gte: start, $lte: end } }],
      };
      if (query.platform) pubQuery.platform = query.platform;
      if (query.connectionId) pubQuery.connectionId = new Types.ObjectId(query.connectionId);
      if (pubStatuses) pubQuery.status = { $in: pubStatuses };
      if (linkedPublicationIds.length > 0) pubQuery._id = { $nin: linkedPublicationIds };
      publications = await this.publicationModel.find(pubQuery).sort({ createdAt: -1 }).exec();
    }

    const connections = await this.socialConnectionsService.list(organizationId, productId);
    const connectionById = new Map(connections.map((c) => [c.id, c]));

    const items: PublishingCalendarItem[] = [];
    for (const s of schedules) {
      const linkedPub = s.status === 'published' && s.publicationId ? linkedPublicationById.get(s.publicationId.toString()) : undefined;
      items.push({
        id: s._id.toString(),
        type: 'scheduled',
        platform: s.platform,
        status: s.status,
        scheduledAt: s.scheduledAt.toISOString(),
        publishedAt: linkedPub?.publishedAt?.toISOString(),
        connection: this.toConnectionRef(connectionById.get(s.connectionId.toString()), s.connectionId.toString()),
        source: { contentArtifactId: s.contentArtifactId.toString(), contentVersionId: s.contentVersionId.toString(), contentVersion: s.contentVersion, contentKind: s.platform },
        creativeAssetId: s.creativeAssetId?.toString(),
        publicationId: linkedPub?._id?.toString(),
        scheduleId: s._id.toString(),
        providerPostUrl: linkedPub?.providerPostUrl,
        errorCode: s.errorCode,
      });
    }
    for (const p of publications) {
      items.push({
        id: p._id.toString(),
        type: 'publication',
        platform: p.platform,
        status: toProcessingBucket(p.status),
        publishedAt: p.publishedAt?.toISOString(),
        connection: this.toConnectionRef(connectionById.get(p.connectionId.toString()), p.connectionId.toString()),
        source: { contentArtifactId: p.contentArtifactId.toString(), contentVersionId: p.contentVersionId.toString(), contentVersion: p.contentVersion, contentKind: p.platform },
        creativeAssetId: p.creativeAssetId?.toString(),
        publicationId: p._id.toString(),
        providerPostUrl: p.providerPostUrl,
        errorCode: p.errorCode,
      });
    }

    items.sort((a, b) => this.effectiveTime(a) - this.effectiveTime(b));
    return items;
  }

  private effectiveTime(item: PublishingCalendarItem): number {
    const value = item.scheduledAt ?? item.publishedAt;
    return value ? new Date(value).getTime() : 0;
  }

  private toConnectionRef(connection: SocialConnectionResponse | undefined, connectionId: string): PublishingCalendarItem['connection'] {
    return { id: connectionId, accountName: connection?.accountName, username: connection?.username };
  }

  private parseRange(startRaw: string, endRaw: string): { start: Date; end: Date } {
    if (!startRaw || !endRaw) {
      throw new BadRequestException('start and end are required.');
    }
    const start = new Date(startRaw);
    const end = new Date(endRaw);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('start and end must be valid ISO date/times.');
    }
    if (end.getTime() <= start.getTime()) {
      throw new BadRequestException('end must be after start.');
    }
    const maxRangeMs = this.getMaxRangeDays() * DAY_MS;
    if (end.getTime() - start.getTime() > maxRangeMs) {
      throw new BadRequestException(`The date range cannot exceed ${this.getMaxRangeDays()} days.`);
    }
    return { start, end };
  }

  private getMaxRangeDays(): number {
    const value = Number(this.configService.get<string>('SOCIAL_CALENDAR_MAX_RANGE_DAYS'));
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_RANGE_DAYS;
  }
}
