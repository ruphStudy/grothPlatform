import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { SocialNoEligibleAccountError, SocialOAuthStateError } from '../../errors/social.errors';
import { SocialEngineService } from '../../engine/social-engine.service';
import type { SocialPlatform } from '../../types/social.types';
import { PendingAccountSelection, PendingAccountSelectionDocument } from '../schemas/pending-account-selection.schema';
import type { PendingSelectionResponse, ResolvedAccountSelection } from '../types/pending-account-selection.types';
import type { SocialConnectionResponse } from '../types/social-connection.types';
import { SocialConnectionsService } from './social-connections.service';
import { TokenEncryptionService } from './token-encryption.service';

const DEFAULT_TTL_SECONDS = 900; // 15 minutes, per spec item 9.
const SELECTION_ID_BYTES = 24;

/**
 * 18E/18F: orchestrates the "discover candidates -> auto-complete or ask
 * the user to choose" flow shared by Facebook Pages and linked Instagram
 * professional accounts. Never calls the provider a second time at
 * selection time — every candidate's token was already fetched (and is
 * stored encrypted) during discovery (item 33).
 */
@Injectable()
export class MetaAccountSelectionService {
  constructor(
    private readonly configService: ConfigService,
    @InjectModel(PendingAccountSelection.name) private readonly pendingModel: Model<PendingAccountSelectionDocument>,
    private readonly socialEngine: SocialEngineService,
    private readonly tokenEncryption: TokenEncryptionService,
    private readonly socialConnectionsService: SocialConnectionsService,
  ) {}

  async resolveOrCreatePending(
    platform: SocialPlatform,
    accessToken: string,
    organizationId: string,
    productId: string,
    userId: string,
    providerName: string,
  ): Promise<ResolvedAccountSelection> {
    const candidates = await this.socialEngine.discoverAccountCandidates(platform, { accessToken });
    if (candidates.length === 0) {
      throw new SocialNoEligibleAccountError(`No eligible ${platform} account was found for this connection.`);
    }
    if (candidates.length === 1) {
      const candidate = candidates[0];
      const finalized: SocialConnectionResponse = await this.socialConnectionsService.upsertFromAuthResult(
        organizationId,
        productId,
        {
          platform,
          externalAccountId: candidate.externalAccountId,
          accountName: candidate.accountName,
          username: candidate.username,
          accessToken: candidate.internalAccessToken,
          refreshToken: candidate.internalRefreshToken,
          expiresAt: candidate.internalExpiresAt,
          scopes: candidate.internalScopes,
          profileUrl: candidate.profileUrl,
        },
        providerName,
        userId,
      );
      return { finalized };
    }

    const selectionId = randomBytes(SELECTION_ID_BYTES).toString('base64url');
    await this.pendingModel.create({
      selectionId,
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      platform,
      userId: new Types.ObjectId(userId),
      providerName,
      candidates: candidates.map((c) => ({
        externalAccountId: c.externalAccountId,
        accountName: c.accountName,
        username: c.username,
        avatarUrl: c.avatarUrl,
        profileUrl: c.profileUrl,
        accountType: c.accountType,
        linkedFacebookPageId: c.linkedFacebookPageId,
        encryptedAccessToken: this.tokenEncryption.encrypt(c.internalAccessToken),
        encryptedRefreshToken: c.internalRefreshToken ? this.tokenEncryption.encrypt(c.internalRefreshToken) : undefined,
        tokenExpiresAt: c.internalExpiresAt,
        scopes: c.internalScopes,
      })),
      expiresAt: new Date(Date.now() + this.getTtlSeconds() * 1000),
    });
    return { pendingSelectionId: selectionId };
  }

  async getPending(organizationId: string, productId: string, platform: SocialPlatform, selectionId: string): Promise<PendingSelectionResponse> {
    const doc = await this.findOwnedPending(organizationId, productId, platform, selectionId);
    if (doc.consumedAt) {
      throw new SocialOAuthStateError('social_oauth_state_consumed', 'This account selection has already been completed.');
    }
    if (doc.expiresAt.getTime() < Date.now()) {
      throw new SocialOAuthStateError('social_oauth_state_expired', 'This account selection has expired.');
    }
    return {
      selectionId: doc.selectionId,
      platform: doc.platform,
      candidates: doc.candidates.map((c) => ({
        externalAccountId: c.externalAccountId,
        accountName: c.accountName,
        username: c.username,
        avatarUrl: c.avatarUrl,
        profileUrl: c.profileUrl,
        accountType: c.accountType,
      })),
      expiresAt: doc.expiresAt,
    };
  }

  async selectCandidate(organizationId: string, productId: string, platform: SocialPlatform, selectionId: string, externalAccountId: string, userId: string): Promise<SocialConnectionResponse> {
    const doc = await this.findOwnedPending(organizationId, productId, platform, selectionId);
    if (doc.consumedAt) {
      throw new SocialOAuthStateError('social_oauth_state_consumed', 'This account selection has already been completed.');
    }
    if (doc.expiresAt.getTime() < Date.now()) {
      throw new SocialOAuthStateError('social_oauth_state_expired', 'This account selection has expired.');
    }
    const candidate = doc.candidates.find((c) => c.externalAccountId === externalAccountId);
    if (!candidate) {
      throw new BadRequestException('The selected account is not part of this pending selection.');
    }
    // One-time use, marked BEFORE finalizing so a concurrent replay can
    // never complete the same selection twice (item 33/H).
    doc.consumedAt = new Date();
    await doc.save();

    return this.socialConnectionsService.upsertFromAuthResult(
      organizationId,
      productId,
      {
        platform,
        externalAccountId: candidate.externalAccountId,
        accountName: candidate.accountName,
        username: candidate.username,
        accessToken: this.tokenEncryption.decrypt(candidate.encryptedAccessToken),
        refreshToken: candidate.encryptedRefreshToken ? this.tokenEncryption.decrypt(candidate.encryptedRefreshToken) : undefined,
        expiresAt: candidate.tokenExpiresAt,
        scopes: candidate.scopes,
        profileUrl: candidate.profileUrl,
      },
      doc.providerName,
      userId,
    );
  }

  private async findOwnedPending(organizationId: string, productId: string, platform: SocialPlatform, selectionId: string): Promise<PendingAccountSelectionDocument> {
    let doc: PendingAccountSelectionDocument | null;
    try {
      doc = await this.pendingModel.findOne({
        selectionId,
        organizationId: new Types.ObjectId(organizationId),
        productId: new Types.ObjectId(productId),
        platform,
      });
    } catch {
      throw new NotFoundException('Pending account selection not found.');
    }
    if (!doc) throw new NotFoundException('Pending account selection not found.');
    return doc;
  }

  private getTtlSeconds(): number {
    const value = this.configService.get<string>('SOCIAL_PENDING_SELECTION_TTL_SECONDS');
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_SECONDS;
  }
}
