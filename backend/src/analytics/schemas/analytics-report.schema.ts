import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { ANALYTICS_REPORT_TYPES } from '../types/analytics.types';
import type { AnalyticsReportType } from '../types/analytics.types';

export type AnalyticsReportDocument = HydratedDocument<AnalyticsReport>;

@Schema({ timestamps: true })
export class AnalyticsReport {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ required: true, maxlength: 120 })
  name: string;

  @Prop({ type: String, enum: ANALYTICS_REPORT_TYPES, required: true })
  reportType: AnalyticsReportType;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  filters: Record<string, string | number | boolean>;

  @Prop({ type: [String], default: [] })
  columns?: string[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  schedule?: Record<string, string | number | boolean>;

  @Prop({ enum: ['active', 'archived'], default: 'active' })
  status: 'active' | 'archived';

  @Prop({ type: Types.ObjectId })
  createdByUserId?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AnalyticsReportSchema = SchemaFactory.createForClass(AnalyticsReport);
AnalyticsReportSchema.index({ organizationId: 1, productId: 1, status: 1, updatedAt: -1 });
