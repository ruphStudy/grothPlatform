import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SOCIAL_PLATFORMS, SOCIAL_REMOTE_POST_STATUSES } from '../../social-integrations/types/social.types';
import type { SocialPlatform, SocialRemotePostStatus } from '../../social-integrations/types/social.types';

export type PublicationStatus = 'pending' | 'publishing' | 'published' | 'failed';
export const PUBLICATION_STATUSES: PublicationStatus[] = ['pending', 'publishing', 'published', 'failed'];

export type SocialPublicationDocument = HydratedDocument<SocialPublication>;

// The exact user-visible copy actually sent to the provider — persisted so
// a historical publication remains auditable even after later
// ContentVersions are generated (item 5). Never the internal prompt,
// grounding evidence, or raw AI response.
@Schema({ _id: false })
export class SocialPublicationContentSnapshot {
  @Prop({ required: true })
  kind: string;

  @Prop({ required: true })
  text: string;

  @Prop({ type: String, enum: ['image'] })
  mediaType?: 'image';
}
export const SocialPublicationContentSnapshotSchema = SchemaFactory.createForClass(SocialPublicationContentSnapshot);

// 19A: one persisted record per explicit "Publish Now" action. Never
// stores a provider token — credentials live only in SocialConnection,
// resolved fresh at publish time.
@Schema({ timestamps: true })
export class SocialPublication {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  campaignId: Types.ObjectId;

  @Prop({ type: String, enum: SOCIAL_PLATFORMS, required: true })
  platform: SocialPlatform;

  @Prop({ type: Types.ObjectId, required: true })
  connectionId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  contentArtifactId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  contentVersionId: Types.ObjectId;

  @Prop({ required: true })
  contentVersion: number;

  @Prop({ type: Types.ObjectId })
  creativeAssetId?: Types.ObjectId;

  @Prop({ type: String, enum: PUBLICATION_STATUSES, required: true, default: 'pending' })
  status: PublicationStatus;

  @Prop()
  providerName?: string;

  @Prop()
  providerPostId?: string;

  @Prop()
  providerPostUrl?: string;

  // X thread support only — the successfully-published post ids in order;
  // providerPostId mirrors the first (root) entry for single posts too.
  @Prop({ type: [String] })
  providerPostIds?: string[];

  @Prop({ type: SocialPublicationContentSnapshotSchema, required: true })
  contentSnapshot: SocialPublicationContentSnapshot;

  @Prop()
  publishedAt?: Date;

  @Prop({ required: true, default: 0 })
  attemptCount: number;

  @Prop()
  lastAttemptAt?: Date;

  @Prop()
  errorCode?: string;

  // 19F: provider-side remote status, kept strictly separate from
  // `status` above (our own execution state). A remote check can never
  // overwrite `status=published` — only these three fields.
  @Prop({ type: String, enum: SOCIAL_REMOTE_POST_STATUSES })
  remoteStatus?: SocialRemotePostStatus;

  @Prop()
  remoteStatusCheckedAt?: Date;

  @Prop()
  remoteStatusErrorCode?: string;

  @Prop({ type: Object })
  providerMetadata?: Record<string, string | number | boolean>;

  // Uniqueness scope (item 12): organizationId+productId+platform+
  // idempotencyKey. A duplicate submit returns the existing record instead
  // of calling the provider again.
  @Prop({ required: true })
  idempotencyKey: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}
export const SocialPublicationSchema = SchemaFactory.createForClass(SocialPublication);
SocialPublicationSchema.index({ organizationId: 1, productId: 1, platform: 1, idempotencyKey: 1 }, { unique: true });
SocialPublicationSchema.index({ organizationId: 1, productId: 1, campaignId: 1, createdAt: -1 });
