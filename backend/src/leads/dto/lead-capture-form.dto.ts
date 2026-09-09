import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsISO8601, IsMongoId, IsObject, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { LEAD_CAPTURE_FORM_FIELD_TYPES } from '../schemas/lead-capture-form.schema';
import type { LeadCaptureFormFieldType } from '../schemas/lead-capture-form.schema';

export class LeadCaptureFormFieldDto {
  @IsString() @MaxLength(80) key!: string;
  @IsEnum(LEAD_CAPTURE_FORM_FIELD_TYPES) type!: LeadCaptureFormFieldType;
  @IsString() @MaxLength(120) label!: string;
  @IsOptional() @IsString() @MaxLength(200) placeholder?: string;
  @IsBoolean() required!: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(120, { each: true }) options?: string[];
  @IsOptional() @IsString() @MaxLength(80) customFieldKey?: string;
  @IsOptional() order?: number;
}

export class LeadCaptureFormConsentDto {
  @IsBoolean() enabled!: boolean;
  @IsBoolean() required!: boolean;
  @IsOptional() @IsString() @MaxLength(500) label?: string;
}

export class LeadCaptureFormAppearanceDto {
  @IsOptional() @IsString() @MaxLength(40) layout?: string;
  @IsOptional() @IsString() @MaxLength(40) theme?: string;
}

export class CreateLeadCaptureFormDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsOptional() @IsMongoId() campaignId?: string;
  @IsOptional() @IsString() @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsString() @MaxLength(80) slug?: string;
  @IsOptional() @IsString() @MaxLength(80) submitButtonText?: string;
  @IsOptional() @IsString() @MaxLength(160) successTitle?: string;
  @IsOptional() @IsString() @MaxLength(500) successMessage?: string;
  @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) fields!: LeadCaptureFormFieldDto[];
  @IsOptional() @ValidateNested() consent?: LeadCaptureFormConsentDto;
  @IsOptional() @ValidateNested() appearance?: LeadCaptureFormAppearanceDto;
}

export class UpdateLeadCaptureFormDto extends CreateLeadCaptureFormDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) declare name: string;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) declare fields: LeadCaptureFormFieldDto[];
}

export class PublicLeadCaptureFormSubmissionDto {
  @IsObject() fields!: Record<string, unknown>;
  @IsOptional() @IsBoolean() consentAccepted?: boolean;
  @IsOptional() @IsString() @MaxLength(200) submissionId?: string;
  @IsOptional() @IsString() @MaxLength(2048) pageUrl?: string;
  @IsOptional() @IsString() @MaxLength(2048) referrerUrl?: string;
  @IsOptional() @IsObject() utm?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(200) _hp?: string;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
}
