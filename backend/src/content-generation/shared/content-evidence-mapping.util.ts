import type { CampaignAudienceChannelMapping } from '../../campaigns/types/campaign-audience-channel.types';
import type { GrowthStrategyOverview } from '../../growth-strategy/types/growth-strategy-overview.types';
import type { StrategySignal, StrategySignalCategory } from '../../growth-strategy/types/strategy-signal.types';
import type { ContentPromptEvidence } from '../types/content-prompt.types';

// Shared by every content-type adapter (blog, LinkedIn, and later 15E-15I):
// maps the Growth Strategy overview's signals/messaging into prompt-safe
// evidence, filtered to the item's own audience. No genuine proof-point or
// verified-fact text exists upstream today — both always stay empty rather
// than fabricating pseudo-evidence from a proof "need"/gap.
export function mapEvidenceFromOverview(overview: GrowthStrategyOverview, audienceSegmentIds: string[]): ContentPromptEvidence {
  const signals = overview.signals.signals;
  const matchesAudience = (s: StrategySignal) => !s.relatedSegmentIds || s.relatedSegmentIds.length === 0 || s.relatedSegmentIds.some((id) => audienceSegmentIds.includes(id));
  const byCategory = (category: StrategySignalCategory) => signals.filter((s) => s.category === category && matchesAudience(s)).map((s) => s.value);

  return {
    pains: byCategory('pain'),
    goals: byCategory('jtbd'),
    objections: overview.messaging.audienceMessages.filter((m) => audienceSegmentIds.includes(m.audienceSegmentId)).flatMap((m) => m.objectionFocus),
    differentiators: byCategory('differentiation'),
    capabilities: byCategory('product'),
    proofPoints: [],
    useCases: signals.filter(matchesAudience).flatMap((s) => s.relatedUseCases ?? []),
    facts: [],
  };
}

export function mapMessagingDirectionsFromOverview(overview: GrowthStrategyOverview, audienceSegmentIds: string[], funnelStage: string, messagingPillarIds: string[]): string[] {
  const directions: string[] = [];
  for (const audienceMessage of overview.messaging.audienceMessages) {
    if (audienceSegmentIds.includes(audienceMessage.audienceSegmentId)) directions.push(audienceMessage.valueMessage);
  }
  for (const funnelMessage of overview.messaging.funnelMessages) {
    if (funnelMessage.stage === funnelStage) directions.push(...funnelMessage.messageThemes);
  }
  for (const messagingPillarId of messagingPillarIds) {
    const messagingPillar = overview.messaging.pillars.find((p) => p.id === messagingPillarId);
    if (messagingPillar) directions.push(messagingPillar.theme);
  }
  return directions;
}

export function resolveAudienceLabel(mapping: CampaignAudienceChannelMapping | undefined, id: string): string {
  return mapping?.audiences.find((a) => a.audienceSegmentId === id)?.label ?? id;
}
