import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export const LEARNING_ALGORITHM_VERSION = 'learning:v1';
export const PROMPT_OPTIMIZATION_VERSION = 'prompt-optimization:v1';
export const STRATEGY_ADJUSTMENT_VERSION = 'strategy-adjustment:v1';
export const LEARNING_STALE_DAYS = 90;

export const LEARNING_DOMAINS = ['content', 'channel', 'cta', 'topic', 'campaign', 'email', 'website', 'social', 'conversion', 'revenue_attribution', 'prompt', 'strategy'] as const;
export const LEARNING_STATUSES = ['active', 'accepted', 'rejected', 'stale', 'superseded'] as const;
export const LEARNING_CONFIDENCE_LEVELS = ['insufficient', 'low', 'medium', 'high'] as const;

export type LearningDomain = (typeof LEARNING_DOMAINS)[number];
export type LearningStatus = (typeof LEARNING_STATUSES)[number];
export type LearningConfidenceLevel = (typeof LEARNING_CONFIDENCE_LEVELS)[number];

export type LearningRunDocument = HydratedDocument<LearningRun>;
export type LearningObservationDocument = HydratedDocument<LearningObservation>;
export type LearningInsightDocument = HydratedDocument<LearningInsight>;
export type LearningRecommendationDocument = HydratedDocument<LearningRecommendation>;
export type StrategyAdjustmentProposalDocument = HydratedDocument<StrategyAdjustmentProposal>;

@Schema({ _id: false })
export class LearningSourceReference {
  @Prop({ required: true })
  sourceType: string;

  @Prop()
  sourceId?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  details?: Record<string, unknown>;
}
export const LearningSourceReferenceSchema = SchemaFactory.createForClass(LearningSourceReference);

@Schema({ _id: false })
export class LearningMetricDefinition {
  @Prop({ required: true })
  metric: string;

  @Prop({ required: true })
  label: string;

  @Prop({ required: true })
  domain: LearningDomain;

  @Prop({ required: true })
  valueType: 'count' | 'rate' | 'currency' | 'score';

  @Prop({ required: true })
  supported: boolean;

  @Prop()
  numeratorEvent?: string;

  @Prop()
  denominatorEvent?: string;
}
export const LearningMetricDefinitionSchema = SchemaFactory.createForClass(LearningMetricDefinition);

@Schema({ timestamps: true })
export class LearningRun {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  from: Date;

  @Prop({ required: true })
  to: Date;

  @Prop({ default: 'all' })
  attributionModel: string;

  @Prop({ required: true, default: LEARNING_ALGORITHM_VERSION })
  algorithmVersion: string;

  @Prop({ type: [LearningMetricDefinitionSchema], default: [] })
  metricRegistry: LearningMetricDefinition[];

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  dataHealth: Record<string, unknown>;

  @Prop({ required: true, default: 'completed' })
  status: string;

  createdAt?: Date;
  updatedAt?: Date;
}
export const LearningRunSchema = SchemaFactory.createForClass(LearningRun);
LearningRunSchema.index({ organizationId: 1, productId: 1, createdAt: -1 });

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class LearningObservation {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'LearningRun' })
  runId?: Types.ObjectId;

  @Prop({ type: String, enum: LEARNING_DOMAINS, required: true })
  domain: LearningDomain;

  @Prop({ required: true })
  subjectType: string;

  @Prop()
  subjectId?: string;

  @Prop({ required: true })
  subjectKey: string;

  @Prop({ required: true })
  metric: string;

  @Prop({ type: Number })
  value?: number | null;

  @Prop({ type: Number })
  numerator?: number | null;

  @Prop({ type: Number })
  denominator?: number | null;

  @Prop({ type: Number, required: true, default: 0 })
  sampleSize: number;

  @Prop()
  currency?: string;

  @Prop({ required: true })
  from: Date;

  @Prop({ required: true })
  to: Date;

  @Prop()
  attributionModel?: string;

  @Prop({ type: [LearningSourceReferenceSchema], default: [] })
  sourceReferences: LearningSourceReference[];

  @Prop({ required: true })
  calculatedAt: Date;

  @Prop({ required: true, default: LEARNING_ALGORITHM_VERSION })
  algorithmVersion: string;
}
export const LearningObservationSchema = SchemaFactory.createForClass(LearningObservation);
LearningObservationSchema.index({ organizationId: 1, productId: 1, domain: 1, metric: 1, subjectKey: 1, from: 1, to: 1 });

@Schema({ timestamps: true })
export class LearningInsight {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: String, enum: LEARNING_DOMAINS, required: true })
  domain: LearningDomain;

  @Prop({ required: true })
  subjectType: string;

  @Prop({ required: true })
  subjectKey: string;

  @Prop({ required: true })
  metric: string;

  @Prop({ type: Number })
  value?: number | null;

  @Prop({ type: Number })
  baselineValue?: number | null;

  @Prop({ type: Number, required: true, default: 0 })
  sampleSize: number;

  @Prop({ type: String, enum: LEARNING_CONFIDENCE_LEVELS, required: true })
  confidence: LearningConfidenceLevel;

  @Prop({ type: Number, required: true })
  confidenceScore: number;

  @Prop({ required: true })
  observation: string;

  @Prop({ type: [LearningSourceReferenceSchema], default: [] })
  evidence: LearningSourceReference[];

  @Prop({ required: true, default: LEARNING_ALGORITHM_VERSION })
  algorithmVersion: string;
}
export const LearningInsightSchema = SchemaFactory.createForClass(LearningInsight);
LearningInsightSchema.index({ organizationId: 1, productId: 1, domain: 1, metric: 1, confidence: 1 });

@Schema({ timestamps: true })
export class LearningRecommendation {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  recommendationType: string;

  @Prop({ required: true })
  safeDimension: string;

  @Prop({ required: true })
  currentValue: string;

  @Prop({ required: true })
  suggestedValue: string;

  @Prop({ required: true })
  metric: string;

  @Prop({ type: Number })
  currentValueMetric?: number | null;

  @Prop({ type: Number })
  suggestedValueMetric?: number | null;

  @Prop({ type: Number, required: true, default: 0 })
  sampleSize: number;

  @Prop({ type: String, enum: LEARNING_CONFIDENCE_LEVELS, required: true })
  confidence: LearningConfidenceLevel;

  @Prop({ type: [LearningSourceReferenceSchema], default: [] })
  evidence: LearningSourceReference[];

  @Prop({ type: String, enum: LEARNING_STATUSES, required: true, default: 'active' })
  status: LearningStatus;

  @Prop({ required: true, default: PROMPT_OPTIMIZATION_VERSION })
  algorithmVersion: string;
}
export const LearningRecommendationSchema = SchemaFactory.createForClass(LearningRecommendation);
LearningRecommendationSchema.index({ organizationId: 1, productId: 1, safeDimension: 1, suggestedValue: 1, status: 1 });

@Schema({ timestamps: true })
export class StrategyAdjustmentProposal {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  strategyId: string;

  @Prop({ required: true })
  strategyVersion: string;

  @Prop({ required: true })
  targetSection: string;

  @Prop({ required: true })
  adjustmentType: string;

  @Prop({ required: true })
  currentState: string;

  @Prop({ required: true })
  proposedChange: string;

  @Prop({ required: true })
  reason: string;

  @Prop({ type: Number, required: true, default: 0 })
  sampleSize: number;

  @Prop({ type: String, enum: LEARNING_CONFIDENCE_LEVELS, required: true })
  confidence: LearningConfidenceLevel;

  @Prop({ type: [LearningSourceReferenceSchema], default: [] })
  evidence: LearningSourceReference[];

  @Prop({ type: String, enum: LEARNING_STATUSES, required: true, default: 'active' })
  status: LearningStatus;

  @Prop({ required: true, default: STRATEGY_ADJUSTMENT_VERSION })
  algorithmVersion: string;
}
export const StrategyAdjustmentProposalSchema = SchemaFactory.createForClass(StrategyAdjustmentProposal);
StrategyAdjustmentProposalSchema.index({ organizationId: 1, productId: 1, strategyId: 1, strategyVersion: 1, status: 1 });
