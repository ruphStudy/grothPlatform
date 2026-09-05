export type ContentQualityDimensionType = 'grounding' | 'fact_validation' | 'seo' | 'readability' | 'brand_voice' | 'originality';

export type ContentQualityStatus = 'excellent' | 'good' | 'needs_improvement' | 'poor';

export type ContentQualityBlockerSeverity = 'medium' | 'high';

export interface ContentQualityDimension {
  type: ContentQualityDimensionType;
  score: number;
  weight: number;
  weightedScore: number;
  status: string;
  applicable: boolean;
}

export interface ContentQualityBlocker {
  type: string;
  severity: ContentQualityBlockerSeverity;
  reason: string;
}

export interface ContentQualityResultResponse {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
  status: ContentQualityStatus;
  score: number;
  dimensions: ContentQualityDimension[];
  blockers: ContentQualityBlocker[];
  strengths: string[];
  weaknesses: string[];
  warnings: string[];
  calculatedAt: Date;
}

export interface ContentQualitySummary {
  status: ContentQualityStatus;
  score: number;
  blockerCount: number;
}

export interface CalculateQualityInput {
  contentVersionId: string;
  artifactId: string;
  organizationId: string;
  productId: string;
  campaignId: string;
}
