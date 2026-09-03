export type GrowthObjectiveType =
  | 'awareness'
  | 'education'
  | 'consideration'
  | 'lead_generation'
  | 'conversion'
  | 'positioning'
  | 'differentiation'
  | 'buyer_enablement'
  | 'retention'
  | 'activation';

export interface GrowthObjective {
  id: string;
  type: GrowthObjectiveType;
  title: string;

  priorityScore: number;
  confidenceScore: number;

  relatedSignalIds: string[];
  relatedAudienceSegmentIds: string[];
  relatedKeywords: string[];

  reasons: string[];
  missingEvidence: string[];
  warnings: string[];
}

export interface GrowthObjectiveResult {
  objectives: GrowthObjective[];
  primaryObjectiveId?: string;
  secondaryObjectiveIds: string[];

  confidenceScore: number;
  warnings: string[];
  generatedAt: Date;
}
