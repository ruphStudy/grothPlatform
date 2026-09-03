export type PainPointCategory =
  | 'efficiency'
  | 'quality'
  | 'consistency'
  | 'visibility'
  | 'learning'
  | 'workflow'
  | 'administration'
  | 'collaboration'
  | 'cost'
  | 'adoption'
  | 'decision_making'
  | 'coordination';

export interface AudiencePainPoint {
  id: string;

  segmentId: string;
  segmentName: string;

  title: string;
  category: PainPointCategory;

  description: string;

  severityScore: number;
  confidenceScore: number;

  evidence: string[];
  reasons: string[];

  relatedUseCases: string[];
  relatedLifecycleStages: string[];
  relatedCommercialRoles: string[];

  caution: string;
}

export interface AudiencePainPointResult {
  painPoints: AudiencePainPoint[];

  bySegment: { segmentId: string; painPointIds: string[] }[];

  strongestPainPointIds: string[];

  confidenceScore: number;

  missingEvidence: string[];
  warnings: string[];

  generatedAt: Date;
}
