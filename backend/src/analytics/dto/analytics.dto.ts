import { IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsMongoId, IsObject, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { ANALYTICS_BUCKETS, ANALYTICS_CHANNELS, ANALYTICS_REPORT_TYPES, WEB_ANALYTICS_EVENT_TYPES } from '../types/analytics.types';
import type { AnalyticsBucket, AnalyticsChannel, AnalyticsReportType, WebAnalyticsEventType } from '../types/analytics.types';

export class AnalyticsDashboardQueryDto {
  @IsOptional() @IsString() range?: '7d' | '30d' | '90d' | 'custom';
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
  @IsOptional() @IsEnum(ANALYTICS_BUCKETS) bucket?: AnalyticsBucket;
  @IsOptional() @IsMongoId() campaignId?: string;
  @IsOptional() @IsEnum(ANALYTICS_CHANNELS) channel?: AnalyticsChannel;
  @IsOptional() @IsString() @MaxLength(40) platform?: string;
  @IsOptional() @IsString() @MaxLength(40) contentKind?: string;
}

export class CreateWebAnalyticsSiteDto {
  @IsString() @MaxLength(120) name!: string;
  @IsUrl({ require_tld: false, require_protocol: true }) @MaxLength(500) websiteUrl!: string;
  @IsOptional() @IsArray() @IsString({ each: true }) allowedOrigins?: string[];
}

export class UpdateWebAnalyticsSiteDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsUrl({ require_tld: false, require_protocol: true }) @MaxLength(500) websiteUrl?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) allowedOrigins?: string[];
  @IsOptional() @IsIn(['active', 'disabled']) status?: 'active' | 'disabled';
}

export class CollectWebAnalyticsEventDto {
  @IsString() @MaxLength(160) trackingKey!: string;
  @IsEnum(WEB_ANALYTICS_EVENT_TYPES) eventType!: WebAnalyticsEventType;
  @IsOptional() @IsString() @MaxLength(120) anonymousVisitorId?: string;
  @IsOptional() @IsString() @MaxLength(120) sessionId?: string;
  @IsOptional() @IsUrl({ require_tld: false, require_protocol: true }) @MaxLength(1000) pageUrl?: string;
  @IsOptional() @IsString() @MaxLength(500) pagePath?: string;
  @IsOptional() @IsString() @MaxLength(300) pageTitle?: string;
  @IsOptional() @IsString() @MaxLength(1000) referrer?: string;
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsOptional() @IsObject() campaign?: Record<string, unknown>;
  @IsOptional() @IsObject() properties?: Record<string, unknown>;
  @IsOptional() @IsBoolean() analyticsConsent?: boolean;
  @IsOptional() @IsString() @MaxLength(200) deduplicationKey?: string;
}

export class CreateAnalyticsReportDto {
  @IsString() @MaxLength(120) name!: string;
  @IsEnum(ANALYTICS_REPORT_TYPES) reportType!: AnalyticsReportType;
  @IsOptional() @IsObject() filters?: Record<string, unknown>;
  @IsOptional() @IsArray() @IsString({ each: true }) columns?: string[];
  @IsOptional() @IsObject() schedule?: Record<string, unknown>;
}

export class UpdateAnalyticsReportDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsEnum(ANALYTICS_REPORT_TYPES) reportType?: AnalyticsReportType;
  @IsOptional() @IsObject() filters?: Record<string, unknown>;
  @IsOptional() @IsArray() @IsString({ each: true }) columns?: string[];
  @IsOptional() @IsObject() schedule?: Record<string, unknown>;
  @IsOptional() @IsIn(['active', 'archived']) status?: 'active' | 'archived';
}

export class AnalyticsExportDto {
  @IsEnum(ANALYTICS_REPORT_TYPES) reportType!: AnalyticsReportType;
  @IsOptional() @IsObject() filters?: Record<string, unknown>;
  @IsOptional() @IsIn(['csv']) format?: 'csv';
  @IsOptional() @IsBoolean() includeHeaders?: boolean;
}
