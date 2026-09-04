import { CampaignDocument } from './schemas/campaign.schema';
import type { CampaignResponse } from './types/campaign.types';

// Shared by CampaignsService and CampaignGoalService so both persist and
// return the exact same response shape.
export function toCampaignResponse(campaign: CampaignDocument): CampaignResponse {
  return {
    id: campaign._id.toString(),
    organizationId: campaign.organizationId.toString(),
    productId: campaign.productId.toString(),
    name: campaign.name,
    slug: campaign.slug,
    description: campaign.description,
    status: campaign.status,
    type: campaign.type,
    objectiveIds: campaign.objectiveIds,
    channelIds: campaign.channelIds,
    audienceSegmentIds: campaign.audienceSegmentIds,
    funnelStages: campaign.funnelStages,
    messagingPillarIds: campaign.messagingPillarIds,
    contentPillarIds: campaign.contentPillarIds,
    acquisitionMotionIds: campaign.acquisitionMotionIds,
    conversionActionIds: campaign.conversionActionIds,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    strategyReference: campaign.strategyReference
      ? {
          reviewedStrategyGeneratedAt: campaign.strategyReference.reviewedStrategyGeneratedAt,
          strategyReviewId: campaign.strategyReference.strategyReviewId?.toString(),
        }
      : undefined,
    planningMetadata: {
      source: campaign.planningMetadata.source,
      version: campaign.planningMetadata.version,
    },
    goal: campaign.goal
      ? {
          type: campaign.goal.type,
          title: campaign.goal.title,
          description: campaign.goal.description,
          priorityScore: campaign.goal.priorityScore,
          confidenceScore: campaign.goal.confidenceScore,
          source: campaign.goal.source,
          relatedStrategyObjectiveIds: campaign.goal.relatedStrategyObjectiveIds,
          relatedFunnelStages: campaign.goal.relatedFunnelStages,
          relatedConversionActionIds: campaign.goal.relatedConversionActionIds,
          successSignals: campaign.goal.successSignals,
          warnings: campaign.goal.warnings,
        }
      : undefined,
    createdBy: campaign.createdBy.toString(),
    updatedBy: campaign.updatedBy?.toString(),
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  };
}
