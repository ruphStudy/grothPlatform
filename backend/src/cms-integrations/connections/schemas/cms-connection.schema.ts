import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CMS_CREDENTIAL_AUTH_TYPES, CMS_PLATFORMS } from '../../types/cms.types';
import type { CmsCredentialAuthType, CmsPlatform } from '../../types/cms.types';

export type CmsConnectionStatus = 'active' | 'invalid' | 'revoked' | 'error';
export const CMS_CONNECTION_STATUSES: CmsConnectionStatus[] = ['active', 'invalid', 'revoked', 'error'];

export type CmsConnectionDocument = HydratedDocument<CmsConnection>;

// Connections are product-scoped only (mirrors SocialConnection, 18B item
// 17) — no campaign dimension. The credential is only ever stored as
// CmsCredentialEncryptionService ciphertext; there is deliberately no
// plaintext credential field anywhere on this schema (item 11).
@Schema({ timestamps: true })
export class CmsConnection {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: String, enum: CMS_PLATFORMS, required: true })
  platform: CmsPlatform;

  @Prop({ required: true })
  siteUrl: string;

  @Prop()
  siteName?: string;

  @Prop()
  externalSiteId?: string;

  @Prop({ type: String, enum: CMS_CREDENTIAL_AUTH_TYPES, required: true })
  authType: CmsCredentialAuthType;

  @Prop({ required: true })
  encryptedCredential: string;

  @Prop()
  username?: string;

  @Prop({ type: String, enum: CMS_CONNECTION_STATUSES, required: true, default: 'active' })
  status: CmsConnectionStatus;

  @Prop({ required: true })
  providerName: string;

  @Prop({ type: [String] })
  capabilities?: string[];

  @Prop()
  lastValidatedAt?: Date;

  @Prop()
  lastErrorCode?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  connectedBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}
export const CmsConnectionSchema = SchemaFactory.createForClass(CmsConnection);
// Reconnecting the same site upserts this same document rather than
// creating a duplicate (item 22).
CmsConnectionSchema.index({ organizationId: 1, productId: 1, platform: 1, siteUrl: 1 }, { unique: true });
