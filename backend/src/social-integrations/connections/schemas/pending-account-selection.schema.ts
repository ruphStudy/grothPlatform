import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SOCIAL_PLATFORMS } from '../../types/social.types';
import type { SocialPlatform } from '../../types/social.types';

export type PendingAccountSelectionDocument = HydratedDocument<PendingAccountSelection>;

// One discovered candidate (Facebook Page, or Instagram professional
// account) with its own token already fetched during discovery —
// encrypted here so the eventual "select" step never needs a second
// provider call (item 9/33).
@Schema({ _id: false })
export class PendingCandidateRecord {
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

  @Prop()
  accountType?: string;

  @Prop()
  linkedFacebookPageId?: string;

  @Prop({ required: true })
  encryptedAccessToken: string;

  @Prop()
  encryptedRefreshToken?: string;

  @Prop()
  tokenExpiresAt?: Date;

  @Prop({ type: [String] })
  scopes?: string[];
}
export const PendingCandidateRecordSchema = SchemaFactory.createForClass(PendingCandidateRecord);

// Short-lived, one-time-use record binding a set of discovered account
// candidates (Facebook Pages / linked Instagram accounts) to the exact
// organization/product/user that triggered the OAuth flow (item 9/32/33).
// Never exposes a token — only PendingAccountSelectionsService's mapped
// response (display fields only) ever leaves the backend.
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class PendingAccountSelection {
  @Prop({ required: true, unique: true })
  selectionId: string;

  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: String, enum: SOCIAL_PLATFORMS, required: true })
  platform: SocialPlatform;

  @Prop({ type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  providerName: string;

  @Prop({ type: [PendingCandidateRecordSchema], required: true })
  candidates: PendingCandidateRecord[];

  @Prop({ required: true })
  expiresAt: Date;

  @Prop()
  consumedAt?: Date;

  createdAt?: Date;
}
export const PendingAccountSelectionSchema = SchemaFactory.createForClass(PendingAccountSelection);
PendingAccountSelectionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
