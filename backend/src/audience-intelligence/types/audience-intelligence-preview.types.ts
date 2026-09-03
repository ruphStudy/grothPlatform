import type { AudienceSignalResult } from './audience-signal.types';
import type { AudienceSegmentResult } from './audience-segment.types';
import type { IcpResult } from './icp.types';
import type { BuyerUserMapResult } from './buyer-user-map.types';
import type { AudiencePainPointResult } from './audience-pain-point.types';
import type { AudienceJtbdResult } from './audience-jtbd.types';
import type { AudiencePrioritizationResult } from './audience-prioritization.types';

export interface AudienceIntelligencePreview {
  signals: AudienceSignalResult;
  segments: AudienceSegmentResult;
  icp: IcpResult;
  buyerUserMap: BuyerUserMapResult;
  painPoints: AudiencePainPointResult;
  jtbd: AudienceJtbdResult;
  prioritization: AudiencePrioritizationResult;
  stats: {
    signalCount: number;
    segmentCount: number;
    icpCandidateCount: number;
    relationshipCount: number;
    painPointCount: number;
    jobCount: number;
    prioritizedSegmentCount: number;
  };
  warnings: string[];
  generatedAt: Date;
}
