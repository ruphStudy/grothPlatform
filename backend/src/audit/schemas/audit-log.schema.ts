import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AuditLog {
  @Prop({ type: Types.ObjectId, index: true })
  organizationId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, index: true })
  productId?: Types.ObjectId;

  @Prop({ required: true, enum: ['user', 'system', 'provider'] })
  actorType: 'user' | 'system' | 'provider';

  @Prop({ type: Types.ObjectId })
  actorUserId?: Types.ObjectId;

  @Prop({ required: true, index: true })
  action: string;

  @Prop({ required: true, index: true })
  resourceType: string;

  @Prop()
  resourceId?: string;

  @Prop({ required: true, enum: ['success', 'failure'], index: true })
  result: 'success' | 'failure';

  @Prop({ type: Object })
  beforeSummary?: Record<string, unknown>;

  @Prop({ type: Object })
  afterSummary?: Record<string, unknown>;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  @Prop()
  requestId?: string;

  @Prop()
  ipHash?: string;

  @Prop({ required: true, index: true })
  occurredAt: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ organizationId: 1, occurredAt: -1 });
AuditLogSchema.index({ organizationId: 1, productId: 1, occurredAt: -1 });
