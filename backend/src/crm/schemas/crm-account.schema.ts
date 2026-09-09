import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CRM_ACCOUNT_STATUSES } from '../types/crm.types';
import type { CrmAccountStatus } from '../types/crm.types';

export type CrmAccountDocument = HydratedDocument<CrmAccount>;

@Schema({ timestamps: true })
export class CrmAccount {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  normalizedName: string;

  @Prop()
  website?: string;

  @Prop()
  domain?: string;

  @Prop()
  industry?: string;

  @Prop()
  country?: string;

  @Prop()
  region?: string;

  @Prop()
  city?: string;

  @Prop()
  phone?: string;

  @Prop({ type: String, enum: CRM_ACCOUNT_STATUSES, required: true, default: 'active' })
  status: CrmAccountStatus;

  @Prop({ type: Types.ObjectId })
  ownerUserId?: Types.ObjectId;

  @Prop()
  notes?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CrmAccountSchema = SchemaFactory.createForClass(CrmAccount);
CrmAccountSchema.index({ organizationId: 1, productId: 1, status: 1 });
CrmAccountSchema.index({ organizationId: 1, productId: 1, normalizedName: 1 });
CrmAccountSchema.index({ organizationId: 1, productId: 1, domain: 1 });
