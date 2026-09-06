import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SocialProviderError } from '../../errors/social.errors';
import { SocialEngineService } from '../../engine/social-engine.service';
import type { SocialAuthResult } from '../../types/social.types';
import { SocialConnection, SocialConnectionDocument } from '../schemas/social-connection.schema';
import type { SocialConnectionResponse } from '../types/social-connection.types';
import { TokenEncryptionService } from './token-encryption.service';

/**
 * 18B: persists reusable social account connections. Tokens are only ever
 * stored as TokenEncryptionService ciphertext, and only the safe
 * SocialConnectionResponse projection (never a token) leaves this service.
 * No publishing happens here — ensureValidAccessToken exists only so a
 * later Sprint 18 publishing feature can reuse it without duplicating
 * refresh logic.
 */
@Injectable()
export class SocialConnectionsService {
  constructor(
    @InjectModel(SocialConnection.name) private readonly connectionModel: Model<SocialConnectionDocument>,
    private readonly socialEngine: SocialEngineService,
    private readonly tokenEncryption: TokenEncryptionService,
  ) {}

  // Reconnecting the same external account (same org+product+platform+
  // externalAccountId) updates this same document instead of creating a
  // duplicate — the unique index on SocialConnection guarantees this even
  // under concurrent upserts (item 16/L).
  async upsertFromAuthResult(organizationId: string, productId: string, authResult: SocialAuthResult, providerName: string, userId: string): Promise<SocialConnectionResponse> {
    const encryptedAccessToken = this.tokenEncryption.encrypt(authResult.accessToken);
    const encryptedRefreshToken = authResult.refreshToken ? this.tokenEncryption.encrypt(authResult.refreshToken) : undefined;
    const doc = await this.connectionModel.findOneAndUpdate(
      {
        organizationId: new Types.ObjectId(organizationId),
        productId: new Types.ObjectId(productId),
        platform: authResult.platform,
        externalAccountId: authResult.externalAccountId,
      },
      {
        $set: {
          accountName: authResult.accountName,
          username: authResult.username,
          profileUrl: authResult.profileUrl,
          encryptedAccessToken,
          encryptedRefreshToken,
          tokenExpiresAt: authResult.expiresAt,
          scopes: authResult.scopes,
          status: 'active',
          providerName,
          connectedBy: new Types.ObjectId(userId),
          lastErrorCode: undefined,
        },
        $setOnInsert: {
          organizationId: new Types.ObjectId(organizationId),
          productId: new Types.ObjectId(productId),
          platform: authResult.platform,
          externalAccountId: authResult.externalAccountId,
        },
      },
      { upsert: true, new: true },
    );
    return this.toResponse(doc!);
  }

  async list(organizationId: string, productId: string): Promise<SocialConnectionResponse[]> {
    const docs = await this.connectionModel
      .find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) })
      .sort({ createdAt: -1 })
      .exec();
    return docs.map((d) => this.toResponse(d));
  }

  async get(organizationId: string, productId: string, connectionId: string): Promise<SocialConnectionResponse> {
    const doc = await this.findOwned(organizationId, productId, connectionId);
    return this.toResponse(doc);
  }

  // Honest local disable only — never claims a remote provider-side token
  // revocation actually happened (item 26).
  async disconnect(organizationId: string, productId: string, connectionId: string): Promise<SocialConnectionResponse> {
    const doc = await this.findOwned(organizationId, productId, connectionId);
    doc.status = 'revoked';
    await doc.save();
    return this.toResponse(doc);
  }

  // Exactly one provider call (item 28/N): decrypts whatever access token
  // is currently stored and calls getProfile once. Deliberately does NOT
  // refresh first — an expired token simply surfaces as a genuine "error"
  // status, which is the honest outcome.
  async validate(organizationId: string, productId: string, connectionId: string): Promise<SocialConnectionResponse> {
    const doc = await this.findOwned(organizationId, productId, connectionId);
    try {
      const accessToken = this.tokenEncryption.decrypt(doc.encryptedAccessToken);
      const profile = await this.socialEngine.getProfile(doc.platform, { accessToken });
      doc.status = 'active';
      doc.lastErrorCode = undefined;
      if (profile.accountName) doc.accountName = profile.accountName;
      if (profile.username) doc.username = profile.username;
      if (profile.avatarUrl) doc.avatarUrl = profile.avatarUrl;
    } catch (err) {
      doc.status = 'error';
      doc.lastErrorCode = err instanceof SocialProviderError ? err.code : 'social_provider_request_failed';
    }
    doc.lastValidatedAt = new Date();
    await doc.save();
    return this.toResponse(doc);
  }

  // Reusable by a future publishing feature (item 29) — not called by
  // validate() above. At most one provider call (the refresh itself).
  async ensureValidAccessToken(doc: SocialConnectionDocument): Promise<string> {
    const isExpired = !!doc.tokenExpiresAt && doc.tokenExpiresAt.getTime() <= Date.now();
    if (!isExpired) {
      return this.tokenEncryption.decrypt(doc.encryptedAccessToken);
    }
    if (!doc.encryptedRefreshToken) {
      doc.status = 'expired';
      await doc.save();
      throw new SocialProviderError('social_token_refresh_failed', 'The access token has expired and no refresh token is available.');
    }
    const refreshToken = this.tokenEncryption.decrypt(doc.encryptedRefreshToken);
    try {
      const refreshed = await this.socialEngine.refreshAccessToken(doc.platform, { refreshToken });
      doc.encryptedAccessToken = this.tokenEncryption.encrypt(refreshed.accessToken);
      if (refreshed.refreshToken) doc.encryptedRefreshToken = this.tokenEncryption.encrypt(refreshed.refreshToken);
      doc.tokenExpiresAt = refreshed.expiresAt;
      doc.status = 'active';
      doc.lastErrorCode = undefined;
      await doc.save();
      return refreshed.accessToken;
    } catch (err) {
      doc.status = 'error';
      doc.lastErrorCode = err instanceof SocialProviderError ? err.code : 'social_token_refresh_failed';
      await doc.save();
      throw err;
    }
  }

  async findOwnedDocument(organizationId: string, productId: string, connectionId: string): Promise<SocialConnectionDocument> {
    return this.findOwned(organizationId, productId, connectionId);
  }

  private async findOwned(organizationId: string, productId: string, connectionId: string): Promise<SocialConnectionDocument> {
    let doc: SocialConnectionDocument | null;
    try {
      doc = await this.connectionModel.findOne({
        _id: new Types.ObjectId(connectionId),
        organizationId: new Types.ObjectId(organizationId),
        productId: new Types.ObjectId(productId),
      });
    } catch {
      throw new NotFoundException('Social connection not found.');
    }
    if (!doc) throw new NotFoundException('Social connection not found.');
    return doc;
  }

  private toResponse(doc: SocialConnectionDocument): SocialConnectionResponse {
    return {
      id: doc._id.toString(),
      platform: doc.platform,
      accountName: doc.accountName,
      username: doc.username,
      avatarUrl: doc.avatarUrl,
      profileUrl: doc.profileUrl,
      status: doc.status,
      scopes: doc.scopes,
      tokenExpiresAt: doc.tokenExpiresAt,
      lastValidatedAt: doc.lastValidatedAt,
      lastErrorCode: doc.lastErrorCode,
      createdAt: doc.createdAt as Date,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
