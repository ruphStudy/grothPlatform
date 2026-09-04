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
    audienceChannelMapping: campaign.audienceChannelMapping
      ? {
          audiences: campaign.audienceChannelMapping.audiences.map((a) => ({
            audienceSegmentId: a.audienceSegmentId,
            label: a.label,
            relevanceScore: a.relevanceScore,
            confidenceScore: a.confidenceScore,
            relatedGoalTypes: a.relatedGoalTypes,
            relatedFunnelStages: a.relatedFunnelStages,
            relatedChannelIds: a.relatedChannelIds,
            reasons: a.reasons,
            warnings: a.warnings,
          })),
          channels: campaign.audienceChannelMapping.channels.map((c) => ({
            channel: c.channel,
            fitScore: c.fitScore,
            confidenceScore: c.confidenceScore,
            audienceSegmentIds: c.audienceSegmentIds,
            relatedGoalTypes: c.relatedGoalTypes,
            relatedFunnelStages: c.relatedFunnelStages,
            reasons: c.reasons,
            weaknesses: c.weaknesses,
            warnings: c.warnings,
          })),
          primaryAudienceSegmentId: campaign.audienceChannelMapping.primaryAudienceSegmentId,
          primaryChannel: campaign.audienceChannelMapping.primaryChannel,
          confidenceScore: campaign.audienceChannelMapping.confidenceScore ?? 0,
          missingEvidence: campaign.audienceChannelMapping.missingEvidence,
          warnings: campaign.audienceChannelMapping.warnings,
          source: campaign.audienceChannelMapping.source,
          generatedAt: campaign.audienceChannelMapping.generatedAt,
        }
      : undefined,
    plan: campaign.plan
      ? {
          durationDays: 30,
          weeks: campaign.plan.weeks.map((w) => ({
            week: w.week,
            days: w.days,
            theme: w.theme,
            objective: w.objective,
            activityIds: w.activityIds,
            confidenceScore: w.confidenceScore,
          })),
          activities: campaign.plan.activities.map((a) => ({
            id: a.id,
            day: a.day,
            week: a.week,
            type: a.type,
            title: a.title,
            objective: a.objective,
            channel: a.channel,
            audienceSegmentIds: a.audienceSegmentIds,
            funnelStage: a.funnelStage,
            messagingPillarIds: a.messagingPillarIds,
            contentPillarIds: a.contentPillarIds,
            keywordDirections: a.keywordDirections,
            contentFormat: a.contentFormat,
            recommendedActions: a.recommendedActions,
            conversionDirection: a.conversionDirection,
            priorityScore: a.priorityScore,
            confidenceScore: a.confidenceScore,
            dependencies: a.dependencies,
            successSignals: a.successSignals,
            status: a.status,
            reasons: a.reasons,
            warnings: a.warnings,
          })),
          topPriorityActivityIds: campaign.plan.topPriorityActivityIds,
          confidenceScore: campaign.plan.confidenceScore,
          missingEvidence: campaign.plan.missingEvidence,
          warnings: campaign.plan.warnings,
          generatedAt: campaign.plan.generatedAt,
        }
      : undefined,
    createdBy: campaign.createdBy.toString(),
    updatedBy: campaign.updatedBy?.toString(),
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  };
}
