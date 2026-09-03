export type GrowthMotionType =
  | 'seo_led'
  | 'content_led'
  | 'product_led'
  | 'sales_led'
  | 'community_led'
  | 'partnership_led'
  | 'paid_acquisition_led'
  | 'hybrid';

export interface GrowthMotion {
  type: GrowthMotionType;

  fitScore: number;
  confidenceScore: number;

  supportingChannelIds: string[];
  supportingObjectiveIds: string[];

  reasons: string[];
  weaknesses: string[];
  warnings: string[];
}

export interface GrowthMotionResult {
  motions: GrowthMotion[];

  primaryMotion?: GrowthMotionType;
  secondaryMotions: GrowthMotionType[];

  confidenceScore: number;
  warnings: string[];

  generatedAt: Date;
}
