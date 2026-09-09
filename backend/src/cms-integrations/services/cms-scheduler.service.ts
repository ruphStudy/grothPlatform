import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { CmsSchedule, CmsScheduleDocument } from '../schemas/cms-schedule.schema';
import { CmsPublicationsService } from './cms-publications.service';

const DEFAULT_POLL_SECONDS = 30;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_LOCK_TIMEOUT_SECONDS = 300;

@Injectable()
export class CmsSchedulerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(CmsSchedulerService.name);
  private readonly workerId = `${process.pid}-${randomUUID().slice(0, 8)}`;
  private timer?: ReturnType<typeof setInterval>;
  private ticking = false;

  constructor(
    @InjectModel(CmsSchedule.name) private readonly scheduleModel: Model<CmsScheduleDocument>,
    private readonly configService: ConfigService,
    private readonly cmsPublicationsService: CmsPublicationsService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.getPollSeconds() * 1000);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      for (let i = 0; i < this.getBatchSize(); i += 1) {
        const claimed = await this.claimNext();
        if (!claimed) break;
        await this.execute(claimed);
      }
    } catch (error) {
      this.logger.error(`CMS scheduler tick failed: ${this.describeError(error)}`);
    } finally {
      this.ticking = false;
    }
  }

  private async claimNext(): Promise<CmsScheduleDocument | null> {
    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + this.getLockTimeoutSeconds() * 1000);
    return this.scheduleModel.findOneAndUpdate(
      {
        $or: [
          { status: 'scheduled', scheduledAt: { $lte: now } },
          { status: 'processing', lockExpiresAt: { $lte: now }, publicationId: { $exists: false } },
        ],
      },
      {
        $set: { status: 'processing', lockedAt: now, lockedBy: this.workerId, lockExpiresAt },
        $inc: { attemptCount: 1 },
      },
      { sort: { scheduledAt: 1 }, new: true },
    );
  }

  private async execute(schedule: CmsScheduleDocument): Promise<void> {
    const scheduleId = schedule._id.toString();
    try {
      const publication = await this.cmsPublicationsService.publishBlog(
        schedule.organizationId.toString(),
        schedule.productId.toString(),
        schedule.campaignId.toString(),
        schedule.contentArtifactId.toString(),
        schedule.contentVersion,
        schedule.createdBy?.toString() ?? 'scheduler',
        {
          connectionId: schedule.cmsConnectionId.toString(),
          mode: schedule.publishMode,
          idempotencyKey: `cms-schedule:${scheduleId}`,
          featuredCreativeAssetId: schedule.featuredCreativeAssetId?.toString(),
          categoryIds: schedule.categoryIds ?? [],
          tagIds: schedule.tagIds ?? [],
        },
      );
      if (publication.status === 'failed') {
        await this.scheduleModel.updateOne(
          { _id: schedule._id },
          { $set: { status: 'failed', publicationId: new Types.ObjectId(publication.id), lastAttemptAt: new Date(), errorCode: publication.errorCode ?? 'cms_provider_request_failed' } },
        );
        return;
      }
      await this.scheduleModel.updateOne(
        { _id: schedule._id },
        { $set: { status: 'completed', publicationId: new Types.ObjectId(publication.id), lastAttemptAt: new Date(), errorCode: undefined } },
      );
      this.logger.log(`cmsScheduleId=${scheduleId} status=completed publicationId=${publication.id} workerId=${this.workerId}`);
    } catch (error) {
      const errorCode = this.extractErrorCode(error);
      await this.scheduleModel.updateOne(
        { _id: schedule._id },
        { $set: { status: 'failed', lastAttemptAt: new Date(), errorCode } },
      );
      this.logger.warn(`cmsScheduleId=${scheduleId} status=failed errorCode=${errorCode} workerId=${this.workerId}`);
    }
  }

  private isEnabled(): boolean {
    return this.configService.get<string>('CMS_SCHEDULER_ENABLED') !== 'false';
  }

  private getPollSeconds(): number {
    return this.getEnvNumber('CMS_SCHEDULER_POLL_SECONDS', DEFAULT_POLL_SECONDS);
  }

  private getBatchSize(): number {
    return this.getEnvNumber('CMS_SCHEDULER_BATCH_SIZE', DEFAULT_BATCH_SIZE);
  }

  private getLockTimeoutSeconds(): number {
    return this.getEnvNumber('CMS_SCHEDULER_LOCK_TIMEOUT_SECONDS', DEFAULT_LOCK_TIMEOUT_SECONDS);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const parsed = Number(this.configService.get<string>(key));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private extractErrorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') return (error as { code: string }).code;
    return 'cms_publish_failed';
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown error';
  }
}
