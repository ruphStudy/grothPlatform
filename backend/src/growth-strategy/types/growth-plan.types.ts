export type GrowthPlanPhase = 'days_1_30' | 'days_31_60' | 'days_61_90';

export type GrowthInitiativeType =
  | 'foundation'
  | 'validation'
  | 'audience'
  | 'messaging'
  | 'content'
  | 'seo'
  | 'acquisition'
  | 'conversion'
  | 'activation'
  | 'proof'
  | 'measurement'
  | 'optimization';

export interface GrowthInitiative {
  id: string;
  phase: GrowthPlanPhase;
  type: GrowthInitiativeType;

  title: string;
  objective: string;

  priorityScore: number;
  confidenceScore: number;

  relatedObjectiveIds: string[];
  relatedChannelIds: string[];
  relatedContentPillarIds: string[];
  relatedAcquisitionMotionIds: string[];
  relatedConversionActionIds: string[];

  audienceSegmentIds: string[];
  funnelStages: string[];

  actions: string[];
  expectedLearning: string[];
  dependencies: string[];
  successSignals: string[];

  reasons: string[];
  warnings: string[];
}

export interface GrowthPlanMilestone {
  id: string;
  phase: GrowthPlanPhase;
  title: string;

  initiativeIds: string[];

  outcomeDirection: string;
  validationSignals: string[];

  confidenceScore: number;
}

export interface GrowthPlanPhaseSummary {
  phase: GrowthPlanPhase;

  theme: string;
  objective: string;

  initiativeIds: string[];
  milestoneIds: string[];

  confidenceScore: number;
}

export interface GrowthPlanResult {
  phases: GrowthPlanPhaseSummary[];
  initiatives: GrowthInitiative[];
  milestones: GrowthPlanMilestone[];

  topPriorityInitiativeIds: string[];

  confidenceScore: number;
  missingEvidence: string[];
  warnings: string[];

  generatedAt: Date;
}
