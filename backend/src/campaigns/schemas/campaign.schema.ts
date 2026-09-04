import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const CAMPAIGN_STATUSES = ['draft', 'planned', 'approved', 'active', 'paused', 'completed', 'archived'] as const;

export const CAMPAIGN_TYPES = [
  'awareness',
  'education',
  'consideration',
  'lead_generation',
  'conversion',
  'activation',
  'retention',
  'product_launch',
  'promotion',
  'evergreen',
  'custom',
] as const;

export const CAMPAIGN_PLANNING_SOURCES = ['manual', 'strategy_generated'] as const;

export type CampaignDocument = HydratedDocument<Campaign>;

// Lightweight pointer back to the Growth Strategy this campaign was planned
// from — never the strategy payload itself, which stays derived/rebuildable.
@Schema({ _id: false })
export class CampaignStrategyReference {
  @Prop({ type: Date })
  reviewedStrategyGeneratedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'GrowthStrategyReview' })
  strategyReviewId?: Types.ObjectId;
}
export const CampaignStrategyReferenceSchema = SchemaFactory.createForClass(CampaignStrategyReference);

@Schema({ _id: false })
export class CampaignPlanningMetadata {
  @Prop({ type: String, enum: CAMPAIGN_PLANNING_SOURCES, required: true, default: 'manual' })
  source: (typeof CAMPAIGN_PLANNING_SOURCES)[number];

  @Prop({ type: Number, required: true, default: 1 })
  version: number;
}
export const CampaignPlanningMetadataSchema = SchemaFactory.createForClass(CampaignPlanningMetadata);

@Schema({ timestamps: true })
export class Campaign {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  slug: string;

  @Prop()
  description?: string;

  @Prop({ type: String, enum: CAMPAIGN_STATUSES, required: true, default: 'draft' })
  status: (typeof CAMPAIGN_STATUSES)[number];

  @Prop({ type: String, enum: CAMPAIGN_TYPES })
  type?: (typeof CAMPAIGN_TYPES)[number];

  // Strategy-linkage references only — IDs into Sprint 12 result shapes,
  // never the strategy content itself.
  @Prop({ type: [String], default: [] })
  objectiveIds: string[];

  @Prop({ type: [String], default: [] })
  channelIds: string[];

  @Prop({ type: [String], default: [] })
  audienceSegmentIds: string[];

  @Prop({ type: [String], default: [] })
  funnelStages: string[];

  @Prop({ type: [String], default: [] })
  messagingPillarIds: string[];

  @Prop({ type: [String], default: [] })
  contentPillarIds: string[];

  @Prop({ type: [String], default: [] })
  acquisitionMotionIds: string[];

  @Prop({ type: [String], default: [] })
  conversionActionIds: string[];

  @Prop({ type: Date })
  startDate?: Date;

  @Prop({ type: Date })
  endDate?: Date;

  @Prop({ type: CampaignStrategyReferenceSchema })
  strategyReference?: CampaignStrategyReference;

  @Prop({ type: CampaignPlanningMetadataSchema, required: true, default: () => ({ source: 'manual', version: 1 }) })
  planningMetadata: CampaignPlanningMetadata;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);
CampaignSchema.index({ organizationId: 1, productId: 1, status: 1 });
CampaignSchema.index({ organizationId: 1, productId: 1, slug: 1 }, { unique: true });
