import { IsOptional, IsString } from 'class-validator';

export class RequestGrowthStrategyChangesDto {
  @IsOptional()
  @IsString()
  note?: string;
}
