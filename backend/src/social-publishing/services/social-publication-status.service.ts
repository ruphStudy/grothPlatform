import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SocialPostStatusUnsupportedError, SocialProviderError } from '../../social-integrations/errors/social.errors';
import { SocialEngineService } from '../../social-integrations/engine/social-engine.service';
import { SocialConnectionsService } from '../../social-integrations/connections/services/social-connections.service';
import type { SocialPublicationResponse } from '../types/social-publishing.types';
import { SocialPublishingService } from './social-publishing.service';

/**
 * 19F: centralized, explicit-only remote status sync. Never republishes,
 * never reimplements provider resolution/credential refresh/tenant-safe
 * lookup — those all come from SocialPublishingService/
 * SocialConnectionsService/SocialEngineService exactly as immediate
 * publishing (19A/19B) already established. Makes at most one provider
 * request per call, and only ever mutates the three remoteStatus* fields
 * — `status` (our own execution state) is never touched here.
 */
@Injectable()
export class SocialPublicationStatusService {
  private readonly logger = new Logger(SocialPublicationStatusService.name);

  constructor(
    private readonly socialPublishingService: SocialPublishingService,
    private readonly socialConnectionsService: SocialConnectionsService,
    private readonly socialEngine: SocialEngineService,
  ) {}

  async syncStatus(organizationId: string, productId: string, campaignId: string, publicationId: string): Promise<SocialPublicationResponse> {
    const doc = await this.socialPublishingService.findOwned(organizationId, productId, campaignId, publicationId);
    if (!doc.providerPostId) {
      throw new BadRequestException('This publication has no provider post id to check yet.');
    }

    // Capability is checked before anything else — no connection lookup,
    // no token refresh, no provider call, and no document mutation at all
    // when unsupported (item 18/23/L). This is the only error this method
    // lets propagate as a request failure; everything after this point is
    // a genuine sync attempt whose failure is recorded, not thrown.
    if (!this.socialEngine.resolveProvider(doc.platform).getCapabilities().fetchPostStatus) {
      throw new SocialPostStatusUnsupportedError(`The ${doc.platform} provider does not support remote status checks.`);
    }

    const connectionDoc = await this.socialConnectionsService.findOwnedDocument(organizationId, productId, doc.connectionId.toString());
    const accessToken = await this.socialConnectionsService.ensureValidAccessToken(connectionDoc);

    try {
      const result = await this.socialEngine.getPostStatus(doc.platform, { accessToken, externalPostId: doc.providerPostId });
      doc.remoteStatus = result.status;
      doc.remoteStatusCheckedAt = result.checkedAt;
      doc.remoteStatusErrorCode = undefined;
      // A deleted/unavailable remote post never removes or overwrites the
      // provider URL history; only a genuinely fresher one replaces it.
      if (result.providerPostUrl) doc.providerPostUrl = result.providerPostUrl;
      await doc.save();
      this.logOutcome(doc, true, undefined);
    } catch (err) {
      // item 30: a sync-request failure keeps the previous remoteStatus —
      // only the error/checkedAt fields move, and `status` is untouched.
      doc.remoteStatusCheckedAt = new Date();
      doc.remoteStatusErrorCode = err instanceof SocialProviderError ? err.code : 'social_provider_request_failed';
      await doc.save();
      this.logOutcome(doc, false, doc.remoteStatusErrorCode);
    }

    return this.socialPublishingService.toResponse(doc);
  }

  // Logs publicationId/platform/connectionId/providerPostId/normalized
  // status/success only — never a token, published text, or raw provider
  // response (item 42).
  private logOutcome(doc: { _id: { toString(): string }; platform: string; connectionId: { toString(): string }; providerPostId?: string; remoteStatus?: string }, success: boolean, errorCode?: string): void {
    this.logger.log(
      `publicationId=${doc._id.toString()} platform=${doc.platform} connectionId=${doc.connectionId.toString()} providerPostId=${doc.providerPostId} remoteStatus=${doc.remoteStatus ?? 'n/a'} success=${success}${errorCode ? ` errorCode=${errorCode}` : ''}`,
    );
  }
}
