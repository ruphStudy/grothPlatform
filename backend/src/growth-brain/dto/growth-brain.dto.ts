import { IsIn, IsISO8601, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class GrowthBrainRunDto {
  @IsOptional()
  @IsISO8601()
  periodFrom?: string;

  @IsOptional()
  @IsISO8601()
  periodTo?: string;
}

export class GrowthBrainQueryDto {
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  confidence?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsNumber()
  minScore?: number;
}

export class GrowthResourceConstraintsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  weeklyEffortUnits?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weeklyHours?: number;

  @IsOptional()
  monetaryBudget?: Array<{ currency: string; amount: number }>;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxActiveInitiatives?: number;

  @IsOptional()
  @IsObject()
  perChannelCaps?: Record<string, number>;
}

export class GrowthBrainStatusDto {
  @IsIn(['proposed', 'selected', 'deferred', 'rejected', 'stale'])
  status: 'proposed' | 'selected' | 'deferred' | 'rejected' | 'stale';
}
