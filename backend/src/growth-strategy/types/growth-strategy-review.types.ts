export type GrowthStrategyReviewStatus = 'draft' | 'approved' | 'changes_requested';

export type GrowthStrategySection =
  | 'overview'
  | 'signals'
  | 'objectives'
  | 'channels'
  | 'funnel'
  | 'messaging'
  | 'content'
  | 'acquisition'
  | 'conversion'
  | 'growth_plan';

export type GrowthStrategySectionStatus = 'pending' | 'approved' | 'changes_requested';

export interface GrowthStrategySectionReviewResponse {
  section: GrowthStrategySection;
  status: GrowthStrategySectionStatus;
  note?: string;
  reviewedAt?: Date;
}

export interface GrowthStrategyReviewResponse {
  organizationId: string;
  productId: string;

  status: GrowthStrategyReviewStatus;
  sectionReviews: GrowthStrategySectionReviewResponse[];

  overallNote?: string;

  approvedAt?: Date;
  changesRequestedAt?: Date;
  reviewedStrategyGeneratedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}
