import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'crypto';
import { Model, Types } from 'mongoose';
import { SocialOAuthStateError } from '../../errors/social.errors';
import type { SocialPlatform } from '../../types/social.types';
import { OAuthState, OAuthStateDocument } from '../schemas/oauth-state.schema';

const DEFAULT_STATE_TTL_SECONDS = 600; // 10 minutes, per spec item 20.
const STATE_BYTES = 32;

export interface CreateOAuthStateInput {
  organizationId: string;
  productId: string;
  platform: SocialPlatform;
  userId: string;
}

export interface ConsumedOAuthState {
  organizationId: string;
  productId: string;
  userId: string;
  codeVerifier?: string;
}

/**
 * 18B item 19/20/22: a random, single-use, expiring token binding one
 * OAuth authorization attempt to the exact org/product/platform/user that
 * started it. The callback resolves tenant identity ONLY from here —
 * never from org/product IDs a caller could supply in the callback query.
 */
@Injectable()
export class OAuthStateService {
  constructor(
    private readonly configService: ConfigService,
    @InjectModel(OAuthState.name) private readonly stateModel: Model<OAuthStateDocument>,
  ) {}

  async create(input: CreateOAuthStateInput): Promise<string> {
    const token = randomBytes(STATE_BYTES).toString('base64url');
    await this.stateModel.create({
      token,
      organizationId: new Types.ObjectId(input.organizationId),
      productId: new Types.ObjectId(input.productId),
      platform: input.platform,
      userId: new Types.ObjectId(input.userId),
      expiresAt: new Date(Date.now() + this.getTtlSeconds() * 1000),
    });
    return token;
  }

  // 18D: attaches a PKCE code_verifier to an already-created state record
  // — called only after buildAuthorizationUrl() generates one, since the
  // state token itself must exist first to build the authorization URL.
  // Server-side only; never returned to the browser.
  async attachCodeVerifier(token: string, codeVerifier: string): Promise<void> {
    await this.stateModel.updateOne({ token }, { $set: { codeVerifier } });
  }

  // One-time use: consuming a valid state immediately marks it consumed,
  // so a replayed callback with the same token is rejected (item 22/G/H).
  async consume(token: string, platform: SocialPlatform): Promise<ConsumedOAuthState> {
    const doc = await this.stateModel.findOne({ token });
    if (!doc) {
      throw new SocialOAuthStateError('social_oauth_state_invalid', 'The OAuth state is invalid.');
    }
    if (doc.consumedAt) {
      throw new SocialOAuthStateError('social_oauth_state_consumed', 'The OAuth state has already been used.');
    }
    if (doc.expiresAt.getTime() < Date.now()) {
      throw new SocialOAuthStateError('social_oauth_state_expired', 'The OAuth state has expired.');
    }
    if (doc.platform !== platform) {
      throw new SocialOAuthStateError('social_oauth_state_invalid', 'The OAuth state does not match the requested platform.');
    }
    doc.consumedAt = new Date();
    await doc.save();
    return { organizationId: doc.organizationId.toString(), productId: doc.productId.toString(), userId: doc.userId.toString(), codeVerifier: doc.codeVerifier };
  }

  private getTtlSeconds(): number {
    const value = this.configService.get<string>('SOCIAL_OAUTH_STATE_TTL_SECONDS');
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_STATE_TTL_SECONDS;
  }
}
