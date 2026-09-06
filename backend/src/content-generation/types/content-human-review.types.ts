export type HumanReviewDecision = 'auto_clear' | 'review_recommended' | 'review_required';

export type HumanReviewReasonCategory = 'grounding' | 'fact_validation' | 'seo' | 'readability' | 'brand_voice' | 'originality' | 'quality' | 'generation' | 'other';

export type HumanReviewReasonSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface HumanReviewReason {
  id: string;
  category: HumanReviewReasonCategory;
  severity: HumanReviewReasonSeverity;
  reason: string;
}

export interface ContentHumanReviewResultResponse {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
  decision: HumanReviewDecision;
  riskScore: number;
  reasons: HumanReviewReason[];
  triggeredRuleIds: string[];
  evaluatedQualityScore?: number;
  evaluatedAt: Date;
}

export interface ContentHumanReviewSummary {
  decision: HumanReviewDecision;
  riskScore: number;
  reasonCount: number;
}

export interface EvaluateHumanReviewInput {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
}
