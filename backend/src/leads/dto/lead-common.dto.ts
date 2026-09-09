import { IsBoolean, IsEnum, IsISO8601, IsMongoId, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { LEAD_CONSENT_STATUSES, LEAD_SOURCE_TYPES, LEAD_STATUSES } from '../types/lead.types';
import type { LeadConsentStatus, LeadSourceType, LeadStatus } from '../types/lead.types';

export class LeadContactDto {
  @IsOptional() @IsString() @MaxLength(120) firstName?: string;
  @IsOptional() @IsString() @MaxLength(120) lastName?: string;
  @IsOptional() @IsString() @MaxLength(240) fullName?: string;
  @IsOptional() @IsString() @MaxLength(320) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) companyName?: string;
  @IsOptional() @IsString() @MaxLength(160) jobTitle?: string;
  @IsOptional() @IsString() @MaxLength(100) country?: string;
  @IsOptional() @IsString() @MaxLength(100) region?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
}

export class LeadConsentDto {
  @IsEnum(LEAD_CONSENT_STATUSES) status!: LeadConsentStatus;
  @IsOptional() @IsISO8601() capturedAt?: string;
  @IsOptional() @IsString() @MaxLength(200) source?: string;
}

export class LeadUtmDto {
  @IsOptional() @IsString() @MaxLength(500) source?: string;
  @IsOptional() @IsString() @MaxLength(500) medium?: string;
  @IsOptional() @IsString() @MaxLength(500) campaign?: string;
  @IsOptional() @IsString() @MaxLength(500) term?: string;
  @IsOptional() @IsString() @MaxLength(500) content?: string;
}

export class LeadSourceDto {
  @IsEnum(LEAD_SOURCE_TYPES) type!: LeadSourceType;
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(100) channel?: string;
  @IsOptional() @IsString() @MaxLength(100) platform?: string;
  @IsOptional() @IsString() @MaxLength(2048) sourceUrl?: string;
  @IsOptional() @IsString() @MaxLength(2048) landingPageUrl?: string;
  @IsOptional() @IsString() @MaxLength(2048) referrerUrl?: string;
  @IsOptional() @IsString() @MaxLength(200) externalSourceId?: string;
}

export class UpdateLeadDto extends LeadContactDto {
  @IsOptional() @IsEnum(LEAD_STATUSES) status?: LeadStatus;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
  @IsOptional() consent?: LeadConsentDto;
}

export class ManualLeadDto extends LeadContactDto {
  @IsOptional() @IsMongoId() campaignId?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsObject() customFields?: Record<string, unknown>;
  @IsOptional() consent?: LeadConsentDto;
}

export class PublicLeadCaptureDto {
  @IsOptional() @IsString() @MaxLength(120) firstName?: string;
  @IsOptional() @IsString() @MaxLength(120) lastName?: string;
  @IsOptional() @IsString() @MaxLength(240) fullName?: string;
  @IsOptional() @IsString() @MaxLength(320) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) companyName?: string;
  @IsOptional() @IsString() @MaxLength(160) jobTitle?: string;
  @IsOptional() @IsBoolean() consent?: boolean;
  @IsOptional() @IsObject() fields?: Record<string, unknown>;
  @IsOptional() utm?: LeadUtmDto;
  @IsOptional() @IsString() @MaxLength(2048) pageUrl?: string;
  @IsOptional() @IsString() @MaxLength(2048) referrerUrl?: string;
  @IsOptional() @IsString() @MaxLength(200) submissionId?: string;
  @IsOptional() @IsString() @MaxLength(200) externalSourceId?: string;
  @IsOptional() @IsString() @MaxLength(200) _hp?: string;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
}
