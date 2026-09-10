import { IsEmail, IsEnum, IsMongoId, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { EMAIL_PLATFORMS, EMAIL_PURPOSES, EMAIL_SENDER_TYPES, EMAIL_TEMPLATE_STATUSES, EMAIL_TEMPLATE_TYPES } from '../types/email.types';
import type { EmailPlatform, EmailPurpose, EmailSenderType, EmailTemplateStatus, EmailTemplateType } from '../types/email.types';

export class CreateEmailConnectionDto {
  @IsEnum(EMAIL_PLATFORMS) platform!: EmailPlatform;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsObject() credential!: { apiKey?: string };
}

export class UpdateEmailCredentialDto {
  @IsObject() credential!: { apiKey?: string };
}

export class CreateEmailSenderDto {
  @IsMongoId() connectionId!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsEnum(EMAIL_SENDER_TYPES) type?: EmailSenderType;
}

export class TestEmailSendDto {
  @IsMongoId() connectionId!: string;
  @IsMongoId() senderId!: string;
  @IsEmail() recipientEmail!: string;
  @IsOptional() @IsString() @MaxLength(120) recipientName?: string;
  @IsString() @MinLength(1) @MaxLength(200) subject!: string;
  @IsOptional() @IsString() text?: string;
  @IsOptional() @IsString() html?: string;
  @IsOptional() @IsString() @MaxLength(320) replyTo?: string;
  @IsString() @MinLength(8) @MaxLength(200) idempotencyKey!: string;
  @IsOptional() @IsEnum(EMAIL_PURPOSES) purpose?: EmailPurpose;
  @IsOptional() @IsMongoId() templateId?: string;
  @IsOptional() @IsNumber() @Min(1) templateVersion?: number;
}

export class CreateEmailTemplateDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsEnum(EMAIL_TEMPLATE_TYPES) type!: EmailTemplateType;
  @IsString() @MinLength(1) @MaxLength(200) subjectTemplate!: string;
  @IsOptional() @IsString() htmlTemplate?: string;
  @IsOptional() @IsString() textTemplate?: string;
  @IsOptional() @IsString() @MaxLength(240) previewText?: string;
  @IsOptional() @IsEnum(EMAIL_TEMPLATE_STATUSES) status?: EmailTemplateStatus;
}

export class UpdateEmailTemplateDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?: string;
  @IsOptional() @IsEnum(EMAIL_TEMPLATE_TYPES) type?: EmailTemplateType;
  @IsOptional() @IsEnum(EMAIL_TEMPLATE_STATUSES) status?: EmailTemplateStatus;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) subjectTemplate?: string;
  @IsOptional() @IsString() htmlTemplate?: string;
  @IsOptional() @IsString() textTemplate?: string;
  @IsOptional() @IsString() @MaxLength(240) previewText?: string;
}

export class PreviewEmailTemplateDto {
  @IsOptional() @IsMongoId() leadId?: string;
  @IsOptional() @IsMongoId() opportunityId?: string;
  @IsOptional() @IsMongoId() campaignId?: string;
  @IsOptional() @IsMongoId() senderId?: string;
}

export class EmailAudienceDefinitionDto {
  @IsOptional() statuses?: string[];
  @IsOptional() qualificationStatuses?: string[];
  @IsOptional() grades?: string[];
  @IsOptional() campaignIds?: string[];
  @IsOptional() sourceTypes?: string[];
  @IsOptional() consentStatuses?: string[];
  @IsOptional() communicationEligibility?: string[];
  @IsOptional() leadIds?: string[];
}

export class CreateEmailCampaignDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsOptional() @IsMongoId() campaignId?: string;
  @IsMongoId() templateId!: string;
  @IsOptional() @IsNumber() @Min(1) templateVersion?: number;
  @IsMongoId() senderId!: string;
  @IsOptional() @IsString() @MaxLength(200) subjectOverride?: string;
  @IsObject() audienceDefinition!: EmailAudienceDefinitionDto;
}

export class AudiencePreviewDto {
  @IsObject() audienceDefinition!: EmailAudienceDefinitionDto;
  @IsOptional() @IsMongoId() templateId?: string;
  @IsOptional() @IsNumber() @Min(1) @Max(1000) templateVersion?: number;
}
