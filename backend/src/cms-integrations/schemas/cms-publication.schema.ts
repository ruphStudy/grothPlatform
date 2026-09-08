import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CMS_PLATFORMS } from '../types/cms.types';
import type { CmsPlatform, CmsSeoMetadata } from '../types/cms.types';

export type CmsPublicationDocument = HydratedDocument<CmsPublication>;
export type CmsPublicationStatus = 'pending' | 'publishing' | 'draft_created' | 'published' | 'failed';
export type CmsPublishMode = 'draft' | 'publish';

export const CMS_PUBLICATION_STATUSES: CmsPublicationStatus[] = ['pending', 'publishing', 'draft_created', 'published', 'failed'];
export const CMS_PUBLISH_MODES: CmsPublishMode[] = ['draft', 'publish'];

@Schema({ _id: false })
export class CmsPublicationSeoMetadata {
  @Prop()
  metaTitle?: string;

  @Prop()
  metaDescription?: string;

  @Prop()
  focusKeyword?: string;
}
export const CmsPublicationSeoMetadataSchema = SchemaFactory.createForClass(CmsPublicationSeoMetadata);

@Schema({ timestamps: true })
export class CmsPublication {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  campaignId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  cmsConnectionId: Types.ObjectId;

  @Prop({ type: String, enum: CMS_PLATFORMS, required: true })
  platform: CmsPlatform;

  @Prop({ type: Types.ObjectId, required: true })
  contentArtifactId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  contentVersionId: Types.ObjectId;

  @Prop({ required: true })
  contentVersion: number;

  @Prop({ type: String, enum: CMS_PUBLICATION_STATUSES, required: true })
  status: CmsPublicationStatus;

  @Prop({ type: String, enum: CMS_PUBLISH_MODES, required: true })
  publishMode: CmsPublishMode;

  @Prop()
  externalPostId?: string;

  @Prop()
  externalPostUrl?: string;

  @Prop({ required: true })
  titleSnapshot: string;

  @Prop({ required: true })
  contentSnapshot: string;

  @Prop()
  excerptSnapshot?: string;

  @Prop()
  slugSnapshot?: string;

  @Prop({ type: CmsPublicationSeoMetadataSchema })
  seo?: CmsSeoMetadata;

  @Prop({ type: Types.ObjectId })
  featuredCreativeAssetId?: Types.ObjectId;

  @Prop()
  externalMediaId?: string;

  @Prop({ type: [Number], default: [] })
  categoryIds: number[];

  @Prop({ type: [Number], default: [] })
  tagIds: number[];

  @Prop()
  providerName?: string;

  @Prop({ required: true, default: 0 })
  attemptCount: number;

  @Prop()
  lastAttemptAt?: Date;

  @Prop()
  errorCode?: string;

  @Prop()
  publishedAt?: Date;

  @Prop({ required: true })
  idempotencyKey: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CmsPublicationSchema = SchemaFactory.createForClass(CmsPublication);
CmsPublicationSchema.index({ organizationId: 1, productId: 1, platform: 1, idempotencyKey: 1 }, { unique: true });
CmsPublicationSchema.index({ organizationId: 1, productId: 1, campaignId: 1, createdAt: -1 });
