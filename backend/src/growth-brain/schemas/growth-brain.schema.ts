import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export const GROWTH_BRAIN_VERSION = 'growth-brain:v1';
export const GROWTH_DECISION_RUN_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;
export const GROWTH_OPPORTUNITY_TYPES = ['channel', 'content', 'topic', 'cta', 'campaign', 'audience', 'prompt', 'conversion', 'retention', 'other'] as const;
export const GROWTH_CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
export const GROWTH_EFFORT_LEVELS = ['low', 'medium', 'high'] as const;
export const GROWTH_URGENCY_LEVELS = ['low', 'medium', 'high'] as const;
export const GROWTH_OPPORTUNITY_STATUSES = ['proposed', 'selected', 'deferred', 'rejected', 'stale'] as const;
export const CHANNEL_PRIORITY_LEVELS = ['high', 'medium', 'low', 'deprioritized'] as const;
export const WEEKLY_PLAN_STATUSES = ['draft', 'proposed', 'approved', 'rejected', 'superseded'] as const;
export const DECISION_EXPLANATION_TYPES = ['opportunity', 'allocation', 'channel_priority', 'content_priority', 'weekly_plan'] as const;

export type GrowthDecisionRunDocument = HydratedDocument<GrowthDecisionRun>;
export type GrowthOpportunityDocument = HydratedDocument<GrowthOpportunity>;
export type GrowthResourceConstraintsDocument = HydratedDocument<GrowthResourceConstraints>;
export type GrowthAllocationPlanDocument = HydratedDocument<GrowthAllocationPlan>;
export type ChannelPriorityDocument = HydratedDocument<ChannelPriority>;
export type ContentPriorityDocument = HydratedDocument<ContentPriority>;
export type WeeklyGrowthPlanDocument = HydratedDocument<WeeklyGrowthPlan>;
export type GrowthDecisionExplanationDocument = HydratedDocument<GrowthDecisionExplanation>;

@Schema({ _id: false })
export class GrowthTokenUsage {
  @Prop({ type: Number })
  inputTokens?: number;

  @Prop({ type: Number })
  outputTokens?: number;

  @Prop({ type: Number })
  totalTokens?: number;
}
export const GrowthTokenUsageSchema = SchemaFactory.createForClass(GrowthTokenUsage);

@Schema({ _id: false })
export class GrowthCost {
  @Prop()
  currency?: string;

  @Prop({ type: Number })
  estimated?: number;
}
export const GrowthCostSchema = SchemaFactory.createForClass(GrowthCost);

@Schema({ timestamps: true })
export class GrowthDecisionRun {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop()
  strategyId?: string;

  @Prop()
  strategyVersion?: string;

  @Prop({ type: [String], default: [] })
  campaignIds: string[];

  @Prop()
  learningRunId?: string;

  @Prop({ required: true })
  periodFrom: Date;

  @Prop({ required: true })
  periodTo: Date;

  @Prop({ type: String, enum: GROWTH_DECISION_RUN_STATUSES, required: true, default: 'pending' })
  status: (typeof GROWTH_DECISION_RUN_STATUSES)[number];

  @Prop({ required: true, default: GROWTH_BRAIN_VERSION })
  algorithmVersion: string;

  @Prop()
  aiProvider?: string;

  @Prop()
  aiModel?: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  inputSnapshot: Record<string, unknown>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  outputSnapshot?: Record<string, unknown>;

  @Prop({ type: GrowthTokenUsageSchema })
  tokenUsage?: GrowthTokenUsage;

  @Prop({ type: GrowthCostSchema })
  cost?: GrowthCost;

  @Prop()
  errorCode?: string;

  @Prop({ type: Types.ObjectId })
  createdByUserId?: Types.ObjectId;

  @Prop({ required: true })
  startedAt: Date;

  @Prop()
  completedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}
export const GrowthDecisionRunSchema = SchemaFactory.createForClass(GrowthDecisionRun);
GrowthDecisionRunSchema.index({ organizationId: 1, productId: 1, createdAt: -1, status: 1 });

@Schema({ timestamps: true })
export class GrowthOpportunity {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'GrowthDecisionRun', required: true })
  decisionRunId: Types.ObjectId;

  @Prop({ type: String, enum: GROWTH_OPPORTUNITY_TYPES, required: true })
  type: (typeof GROWTH_OPPORTUNITY_TYPES)[number];

  @Prop({ required: true })
  title: string;

  @Prop()
  subjectType?: string;

  @Prop()
  subjectId?: string;

  @Prop()
  subjectKey?: string;

  @Prop({ required: true })
  metric: string;

  @Prop({ type: Number })
  currentValue?: number;

  @Prop({ type: Number })
  baselineValue?: number;

  @Prop({ type: Number })
  potentialValue?: number;

  @Prop()
  potentialValueUnit?: string;

  @Prop({ type: Number, required: true, default: 0 })
  sampleSize: number;

  @Prop({ type: String, enum: GROWTH_CONFIDENCE_LEVELS, required: true })
  confidence: (typeof GROWTH_CONFIDENCE_LEVELS)[number];

  @Prop({ type: String, enum: GROWTH_EFFORT_LEVELS, required: true })
  effort: (typeof GROWTH_EFFORT_LEVELS)[number];

  @Prop({ type: String, enum: GROWTH_URGENCY_LEVELS, required: true })
  urgency: (typeof GROWTH_URGENCY_LEVELS)[number];

  @Prop({ type: [String], default: [] })
  evidenceIds: string[];

  @Prop({ type: Number, required: true })
  score: number;

  @Prop({ type: Number, required: true })
  rank: number;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  scoreComponents: Record<string, number>;

  @Prop({ type: String, enum: GROWTH_OPPORTUNITY_STATUSES, required: true, default: 'proposed' })
  status: (typeof GROWTH_OPPORTUNITY_STATUSES)[number];

  createdAt?: Date;
  updatedAt?: Date;
}
export const GrowthOpportunitySchema = SchemaFactory.createForClass(GrowthOpportunity);
GrowthOpportunitySchema.index({ organizationId: 1, productId: 1, decisionRunId: 1, rank: 1 });

@Schema({ timestamps: { createdAt: false, updatedAt: true } })
export class GrowthResourceConstraints {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Number })
  weeklyEffortUnits?: number;

  @Prop({ type: Number })
  weeklyHours?: number;

  @Prop({ type: [{ currency: String, amount: Number }], default: [] })
  monetaryBudget: Array<{ currency: string; amount: number }>;

  @Prop({ type: Number })
  maxActiveInitiatives?: number;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  perChannelCaps: Record<string, number>;

  updatedAt?: Date;
}
export const GrowthResourceConstraintsSchema = SchemaFactory.createForClass(GrowthResourceConstraints);
GrowthResourceConstraintsSchema.index({ organizationId: 1, productId: 1 }, { unique: true });

@Schema({ _id: false })
export class GrowthAllocationItem {
  @Prop({ required: true })
  opportunityId: string;

  @Prop({ type: Number, required: true })
  allocatedAmount: number;

  @Prop({ type: Number, required: true })
  percentage: number;

  @Prop({ required: true })
  rationaleCode: string;
}
export const GrowthAllocationItemSchema = SchemaFactory.createForClass(GrowthAllocationItem);

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class GrowthAllocationPlan {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'GrowthDecisionRun', required: true })
  decisionRunId: Types.ObjectId;

  @Prop({ required: true })
  resourceType: 'effort' | 'money';

  @Prop()
  currency?: string;

  @Prop({ type: Number, required: true })
  totalAvailable: number;

  @Prop({ type: [GrowthAllocationItemSchema], default: [] })
  allocations: GrowthAllocationItem[];

  @Prop({ type: Number, required: true })
  unallocatedAmount: number;

  @Prop({ required: true, default: GROWTH_BRAIN_VERSION })
  algorithmVersion: string;

  createdAt?: Date;
}
export const GrowthAllocationPlanSchema = SchemaFactory.createForClass(GrowthAllocationPlan);
GrowthAllocationPlanSchema.index({ organizationId: 1, productId: 1, decisionRunId: 1 });

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class ChannelPriority {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'GrowthDecisionRun', required: true })
  decisionRunId: Types.ObjectId;

  @Prop({ required: true })
  channel: string;

  @Prop({ type: String, enum: CHANNEL_PRIORITY_LEVELS, required: true })
  priority: (typeof CHANNEL_PRIORITY_LEVELS)[number];

  @Prop({ type: Number, required: true })
  score: number;

  @Prop({ type: Number, required: true })
  rank: number;

  @Prop({ type: [String], default: [] })
  reasons: string[];

  @Prop({ type: [String], default: [] })
  evidenceIds: string[];

  @Prop({ type: String, enum: GROWTH_CONFIDENCE_LEVELS, required: true })
  confidence: (typeof GROWTH_CONFIDENCE_LEVELS)[number];

  @Prop({ type: Number })
  recommendedEffortPercentage?: number;

  createdAt?: Date;
}
export const ChannelPrioritySchema = SchemaFactory.createForClass(ChannelPriority);
ChannelPrioritySchema.index({ organizationId: 1, productId: 1, decisionRunId: 1, rank: 1 });

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class ContentPriority {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'GrowthDecisionRun', required: true })
  decisionRunId: Types.ObjectId;

  @Prop({ required: true })
  channel: string;

  @Prop({ required: true })
  contentKind: string;

  @Prop()
  topicKey?: string;

  @Prop()
  pillarKey?: string;

  @Prop()
  objective?: string;

  @Prop({ type: Number, required: true })
  priorityScore: number;

  @Prop({ type: Number, required: true })
  rank: number;

  @Prop({ type: Number })
  recommendedQuantity?: number;

  @Prop()
  ctaRecommendation?: string;

  @Prop({ type: [String], default: [] })
  promptSuggestionIds: string[];

  @Prop({ type: [String], default: [] })
  evidenceIds: string[];

  @Prop({ type: String, enum: GROWTH_CONFIDENCE_LEVELS, required: true })
  confidence: (typeof GROWTH_CONFIDENCE_LEVELS)[number];

  createdAt?: Date;
}
export const ContentPrioritySchema = SchemaFactory.createForClass(ContentPriority);
ContentPrioritySchema.index({ organizationId: 1, productId: 1, decisionRunId: 1, rank: 1 });

@Schema({ timestamps: true })
export class WeeklyGrowthPlan {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'GrowthDecisionRun', required: true })
  decisionRunId: Types.ObjectId;

  @Prop({ required: true })
  weekStart: Date;

  @Prop({ required: true })
  weekEnd: Date;

  @Prop({ required: true })
  objective: string;

  @Prop({ type: String, enum: WEEKLY_PLAN_STATUSES, required: true, default: 'proposed' })
  status: (typeof WEEKLY_PLAN_STATUSES)[number];

  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  channelPriorities: unknown[];

  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  contentPlan: unknown[];

  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  experiments: unknown[];

  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  crmActions: unknown[];

  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  optimizationActions: unknown[];

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  allocationSummary: Record<string, unknown>;

  @Prop({ type: [String], default: [] })
  risks: string[];

  @Prop({ type: [String], default: [] })
  assumptions: string[];

  @Prop({ type: [String], default: [] })
  evidenceIds: string[];

  @Prop({ required: true })
  generatedAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}
export const WeeklyGrowthPlanSchema = SchemaFactory.createForClass(WeeklyGrowthPlan);
WeeklyGrowthPlanSchema.index({ organizationId: 1, productId: 1, weekStart: 1, status: 1 });

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class GrowthDecisionExplanation {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'GrowthDecisionRun', required: true })
  decisionRunId: Types.ObjectId;

  @Prop({ type: String, enum: DECISION_EXPLANATION_TYPES, required: true })
  decisionType: (typeof DECISION_EXPLANATION_TYPES)[number];

  @Prop({ required: true })
  decisionEntityId: string;

  @Prop({ required: true })
  summary: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  reasons: Array<Record<string, unknown>>;

  @Prop({ type: [String], default: [] })
  assumptions: string[];

  @Prop({ type: [String], default: [] })
  limitations: string[];

  @Prop()
  aiGeneratedSummary?: string;

  createdAt?: Date;
}
export const GrowthDecisionExplanationSchema = SchemaFactory.createForClass(GrowthDecisionExplanation);
GrowthDecisionExplanationSchema.index({ organizationId: 1, productId: 1, decisionRunId: 1, decisionType: 1 });
