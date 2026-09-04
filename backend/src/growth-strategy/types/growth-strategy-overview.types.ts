import type { FunnelStrategyResult } from './funnel-strategy.types';
import type { GrowthChannelFitResult } from './growth-channel-fit.types';
import type { GrowthObjectiveResult } from './growth-objective.types';
import type { StrategySignalResult } from './strategy-signal.types';

export interface GrowthStrategyOverview {
  signals: StrategySignalResult;
  objectives: GrowthObjectiveResult;
  channels: GrowthChannelFitResult;
  funnel: FunnelStrategyResult;
  generatedAt: Date;
}
