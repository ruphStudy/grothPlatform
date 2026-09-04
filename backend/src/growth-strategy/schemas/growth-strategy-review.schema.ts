import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const GROWTH_STRATEGY_REVIEW_STATUSES = ['draft', 'approved', 'changes_requested'] as const;
export const GROWTH_STRATEGY_SECTIONS = [
  'overview',
  'signals',
  'objectives',
  'channels',
  'funnel',
  'messaging',
  'content',
  'acquisition',
  'conversion',
  'growth_plan',
] as const;
export const GROWTH_STRATEGY_SECTION_STATUSES = ['pending', 'approved', 'changes_requested'] as const;

export type GrowthStrategyReviewDocument = HydratedDocument<GrowthStrategyReview>;

@Schema({ _id: false })
export class GrowthStrategySectionReview {
  @Prop({ type: String, enum: GROWTH_STRATEGY_SECTIONS, required: true })
  section: (typeof GROWTH_STRATEGY_SECTIONS)[number];

  @Prop({ type: String, enum: GROWTH_STRATEGY_SECTION_STATUSES, required: true, default: 'pending' })
  status: (typeof GROWTH_STRATEGY_SECTION_STATUSES)[number];

  @Prop({ type: String })
  note?: string;

  @Prop({ type: Date })
  reviewedAt?: Date;
}
export const GrowthStrategySectionReviewSchema = SchemaFactory.createForClass(GrowthStrategySectionReview);

// Section-level and review-metadata only — the generated strategy payload
// itself is never persisted; it stays derived from existing intelligence.
@Schema({ timestamps: true })
export class GrowthStrategyReview {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ type: String, enum: GROWTH_STRATEGY_REVIEW_STATUSES, required: true, default: 'draft' })
  status: (typeof GROWTH_STRATEGY_REVIEW_STATUSES)[number];

  @Prop({ type: [GrowthStrategySectionReviewSchema], default: [] })
  sectionReviews: GrowthStrategySectionReview[];

  @Prop({ type: String })
  overallNote?: string;

  @Prop({ type: Date })
  approvedAt?: Date;

  @Prop({ type: Date })
  changesRequestedAt?: Date;

  @Prop({ type: Date })
  reviewedStrategyGeneratedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const GrowthStrategyReviewSchema = SchemaFactory.createForClass(GrowthStrategyReview);
GrowthStrategyReviewSchema.index({ organizationId: 1, productId: 1 }, { unique: true });
