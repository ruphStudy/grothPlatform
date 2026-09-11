import { IsDateString, IsEnum, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { ANALYTICS_BUCKETS, ANALYTICS_CHANNELS } from '../types/analytics.types';
import type { AnalyticsBucket, AnalyticsChannel } from '../types/analytics.types';

export class AnalyticsDashboardQueryDto {
  @IsOptional() @IsString() range?: '7d' | '30d' | '90d' | 'custom';
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
  @IsOptional() @IsEnum(ANALYTICS_BUCKETS) bucket?: AnalyticsBucket;
  @IsOptional() @IsMongoId() campaignId?: string;
  @IsOptional() @IsEnum(ANALYTICS_CHANNELS) channel?: AnalyticsChannel;
  @IsOptional() @IsString() @MaxLength(40) platform?: string;
}
