export type AcquisitionMotionType =
  | 'organic_search'
  | 'content_distribution'
  | 'organic_social'
  | 'paid_search'
  | 'paid_social'
  | 'outbound'
  | 'email_nurture'
  | 'community'
  | 'partnerships'
  | 'product_led';

export interface AcquisitionMotion {
  id: string;
  type: AcquisitionMotionType;
  title: string;

  priorityScore: number;
  confidenceScore: number;

  targetAudienceSegmentIds: string[];
  relatedObjectiveIds: string[];
  relatedChannels: string[];
  relatedFunnelStages: string[];
  relatedContentPillarIds: string[];

  supportingKeywords: string[];
  supportingSignalIds: string[];

  recommendedActions: string[];

  reasons: string[];
  weaknesses: string[];
  warnings: string[];
}

export interface AcquisitionPath {
  id: string;
  title: string;

  entryChannel: string;
  entryFunnelStage: string;
  targetAudienceSegmentIds: string[];

  contentFormatDirections: string[];
  messagingPillarIds: string[];

  conversionDirection: string;

  priorityScore: number;
  confidenceScore: number;

  reasons: string[];
}

export interface AcquisitionStrategyResult {
  motions: AcquisitionMotion[];
  paths: AcquisitionPath[];

  primaryMotionId?: string;
  primaryPathId?: string;

  confidenceScore: number;

  missingEvidence: string[];
  warnings: string[];

  generatedAt: Date;
}
