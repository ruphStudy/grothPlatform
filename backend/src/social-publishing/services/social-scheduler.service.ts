import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { SocialSchedule, SocialScheduleDocument } from '../schemas/social-schedule.schema';
import { SocialPublishingService } from './social-publishing.service';

const DEFAULT_POLL_SECONDS = 30;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_LOCK_TIMEOUT_SECONDS = 300;

/**
 * 19D: the ONLY thing that executes a SocialSchedule. It never talks to a
 * provider or re-implements any publishing gate itself — it atomically
 * claims due (or stale-locked) schedules with a single Mongo
 * findOneAndUpdate per claim (so two app instances can never claim the
 * same schedule), then delegates the actual publish, with every gate
 * re-checked fresh, to the existing SocialPublishingService.publish().
 *
 * No BullMQ/Redis/@nestjs/schedule exists in this repo (confirmed), so
 * this is a plain setInterval poller driven by Nest's own module
 * lifecycle — no new dependency, no separate manual command to start it.
 */
@Injectable()
export class SocialSchedulerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(SocialSchedulerService.name);
  private readonly workerId = `${process.pid}-${randomUUID().slice(0, 8)}`;
  private timer?: ReturnType<typeof setInterval>;
  private ticking = false;

  constructor(
    @InjectModel(SocialSchedule.name) private readonly scheduleModel: Model<SocialScheduleDocument>,
    private readonly configService: ConfigService,
    private readonly socialPublishingService: SocialPublishingService,
  ) {}

  onModuleInit(): void {
    const pollMs = this.getPollSeconds() * 1000;
    this.timer = setInterval(() => {
      void this.tick();
    }, pollMs);
    // A timer alone must not keep the Node process alive past shutdown.
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // Exposed for the throwaway verification script — production code never
  // calls this directly, only the interval above does.
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const batchSize = this.getBatchSize();
      for (let i = 0; i < batchSize; i += 1) {
        const claimed = await this.claimNext();
        if (!claimed) break;
        await this.execute(claimed);
      }
    } catch (error) {
      this.logger.error(`Scheduler tick failed: ${this.describeError(error)}`);
    } finally {
      this.ticking = false;
    }
  }

  // Single atomic operation: a due `scheduled` item OR a stale `processing`
  // item with no completed publication yet transitions to `processing`
  // under THIS worker's lock in one findOneAndUpdate call — the guarantee
  // that only one worker instance ever claims a given schedule.
  private async claimNext(): Promise<SocialScheduleDocument | null> {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - this.getLockTimeoutSeconds() * 1000);

    return this.scheduleModel.findOneAndUpdate(
      {
        $or: [
          { status: 'scheduled', scheduledAt: { $lte: now } },
          { status: 'processing', lockedAt: { $lte: staleThreshold }, publicationId: { $exists: false } },
        ],
      },
      {
        $set: { status: 'processing', lockedAt: now, lockedBy: this.workerId },
        $inc: { attemptCount: 1 },
      },
      { sort: { scheduledAt: 1 }, new: true },
    );
  }

  private async execute(schedule: SocialScheduleDocument): Promise<void> {
    const scheduleId = schedule._id.toString();
    const startedAt = Date.now();
    try {
      const publication = await this.socialPublishingService.publish({
        organizationId: schedule.organizationId.toString(),
        productId: schedule.productId.toString(),
        campaignId: schedule.campaignId.toString(),
        artifactId: schedule.contentArtifactId.toString(),
        version: schedule.contentVersion,
        connectionId: schedule.connectionId.toString(),
        creativeAssetId: schedule.creativeAssetId?.toString(),
        // Derived, stable per-schedule key: guarantees SocialPublication's
        // own idempotency protection blocks any duplicate post even across
        // a worker crash/restart or a defense-in-depth double-claim.
        idempotencyKey: `schedule:${scheduleId}`,
        userId: schedule.createdBy?.toString() ?? 'scheduler',
      });

      await this.scheduleModel.updateOne(
        { _id: schedule._id },
        { $set: { status: 'published', publicationId: new Types.ObjectId(publication.id), lastAttemptAt: new Date(), errorCode: undefined } },
      );
      this.logger.log(
        `schedule executed ok scheduleId=${scheduleId} organizationId=${schedule.organizationId} productId=${schedule.productId} campaignId=${schedule.campaignId} platform=${schedule.platform} scheduledAt=${schedule.scheduledAt.toISOString()} workerId=${this.workerId} publicationId=${publication.id} attemptCount=${schedule.attemptCount} status=published`,
      );
    } catch (error) {
      const errorCode = this.extractErrorCode(error);
      await this.scheduleModel.updateOne(
        { _id: schedule._id },
        { $set: { status: 'failed', lastAttemptAt: new Date(), errorCode } },
      );
      this.logger.warn(
        `schedule execution failed scheduleId=${scheduleId} organizationId=${schedule.organizationId} productId=${schedule.productId} campaignId=${schedule.campaignId} platform=${schedule.platform} scheduledAt=${schedule.scheduledAt.toISOString()} workerId=${this.workerId} attemptCount=${schedule.attemptCount} status=failed errorCode=${errorCode} latencyMs=${Date.now() - startedAt}`,
      );
    }
  }

  // Never surfaces post content, tokens, or a raw stack trace — only a
  // normalized, safe code (item "never post content or tokens").
  private extractErrorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error && typeof (error as { code?: unknown }).code === 'string') {
      return (error as { code: string }).code;
    }
    return 'publish_failed';
  }

  private describeError(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown error';
  }

  private getPollSeconds(): number {
    const value = Number(this.configService.get<string>('SOCIAL_SCHEDULER_POLL_SECONDS'));
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_POLL_SECONDS;
  }

  private getBatchSize(): number {
    const value = Number(this.configService.get<string>('SOCIAL_SCHEDULER_BATCH_SIZE'));
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_BATCH_SIZE;
  }

  private getLockTimeoutSeconds(): number {
    const value = Number(this.configService.get<string>('SOCIAL_SCHEDULER_LOCK_TIMEOUT_SECONDS'));
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_LOCK_TIMEOUT_SECONDS;
  }
}
