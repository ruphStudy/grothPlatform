import type { AcquisitionStrategyResult } from './acquisition-strategy.types';
import type { ContentStrategyResult } from './content-strategy.types';
import type { ConversionStrategyResult } from './conversion-strategy.types';
import type { FunnelStrategyResult } from './funnel-strategy.types';
import type { GrowthChannelFitResult } from './growth-channel-fit.types';
import type { GrowthObjectiveResult } from './growth-objective.types';
import type { GrowthPlanResult } from './growth-plan.types';
import type { MessagingStrategyResult } from './messaging-strategy.types';
import type { StrategySignalResult } from './strategy-signal.types';

export interface GrowthStrategyOverview {
  signals: StrategySignalResult;
  objectives: GrowthObjectiveResult;
  channels: GrowthChannelFitResult;
  funnel: FunnelStrategyResult;
  messaging: MessagingStrategyResult;
  contentStrategy: ContentStrategyResult;
  acquisitionStrategy: AcquisitionStrategyResult;
  conversionStrategy: ConversionStrategyResult;
  growthPlan: GrowthPlanResult;
  generatedAt: Date;
}
