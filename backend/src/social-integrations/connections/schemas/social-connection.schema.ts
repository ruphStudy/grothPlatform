import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SOCIAL_PLATFORMS } from '../../types/social.types';
import type { SocialPlatform } from '../../types/social.types';

export type SocialConnectionStatus = 'active' | 'expired' | 'revoked' | 'error';
export const SOCIAL_CONNECTION_STATUSES: SocialConnectionStatus[] = ['active', 'expired', 'revoked', 'error'];

export type SocialConnectionDocument = HydratedDocument<SocialConnection>;

// Connections are product-scoped only (item 17) — no campaign dimension,
// never shared across organizations. Tokens are stored only as
// TokenEncryptionService ciphertext; there is deliberately no plaintext
// token field anywhere on this schema.
@Schema({ timestamps: true })
export class SocialConnection {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: String, enum: SOCIAL_PLATFORMS, required: true })
  platform: SocialPlatform;

  @Prop({ required: true })
  externalAccountId: string;

  @Prop()
  accountName?: string;

  @Prop()
  username?: string;

  @Prop()
  avatarUrl?: string;

  @Prop()
  profileUrl?: string;

  @Prop({ required: true })
  encryptedAccessToken: string;

  @Prop()
  encryptedRefreshToken?: string;

  @Prop()
  tokenExpiresAt?: Date;

  @Prop({ type: [String] })
  scopes?: string[];

  @Prop({ type: String, enum: SOCIAL_CONNECTION_STATUSES, required: true, default: 'active' })
  status: SocialConnectionStatus;

  @Prop({ required: true })
  providerName: string;

  @Prop()
  lastValidatedAt?: Date;

  @Prop()
  lastErrorCode?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  connectedBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}
export const SocialConnectionSchema = SchemaFactory.createForClass(SocialConnection);
// Reconnecting the same external account upserts this same document
// rather than creating a duplicate (item 16).
SocialConnectionSchema.index({ organizationId: 1, productId: 1, platform: 1, externalAccountId: 1 }, { unique: true });
