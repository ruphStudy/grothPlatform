import { IsDateString, IsOptional } from 'class-validator';

export class ApproveGrowthStrategyDto {
  // The generatedAt timestamp from the strategy the user actually reviewed
  // (from a prior overview-preview/plan-preview response). Approving does
  // NOT rebuild the strategy just to capture this — the client passes the
  // timestamp it already has.
  @IsOptional()
  @IsDateString()
  strategyGeneratedAt?: string;
}
