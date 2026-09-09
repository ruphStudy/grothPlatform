import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsISO8601, IsMongoId, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CRM_ACCOUNT_STATUSES, CRM_FOLLOW_UP_STATUSES, CRM_FOLLOW_UP_TYPES, CRM_OPPORTUNITY_STATUSES, CRM_STAGE_CATEGORIES } from '../types/crm.types';
import type { CrmAccountStatus, CrmActivityType, CrmFollowUpStatus, CrmFollowUpType, CrmOpportunityStatus, CrmStageCategory } from '../types/crm.types';

export class CreateCrmAccountDto {
  @IsString() @MinLength(2) @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(2048) website?: string;
  @IsOptional() @IsString() @MaxLength(160) industry?: string;
  @IsOptional() @IsString() @MaxLength(100) country?: string;
  @IsOptional() @IsString() @MaxLength(100) region?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsMongoId() ownerUserId?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class UpdateCrmAccountDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(2048) website?: string;
  @IsOptional() @IsString() @MaxLength(160) industry?: string;
  @IsOptional() @IsString() @MaxLength(100) country?: string;
  @IsOptional() @IsString() @MaxLength(100) region?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsMongoId() ownerUserId?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsEnum(CRM_ACCOUNT_STATUSES) status?: CrmAccountStatus;
}

export class ExportCrmOpportunitiesDto {
  @IsOptional() @IsArray() @IsMongoId({ each: true }) opportunityIds?: string[];
  @IsOptional() @IsObject() filters?: Record<string, unknown>;
}

export class CreateCrmPipelineDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateCrmPipelineDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateCrmStageDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsEnum(CRM_STAGE_CATEGORIES) category!: CrmStageCategory;
  @IsNumber() @Min(1) order!: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) probability?: number;
}

export class UpdateCrmStageDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsEnum(CRM_STAGE_CATEGORIES) category?: CrmStageCategory;
  @IsOptional() @IsNumber() @Min(1) order?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) probability?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ReorderCrmStagesDto {
  @IsArray() @ArrayMaxSize(50) @IsMongoId({ each: true }) stageIds!: string[];
}

export class ConvertLeadToOpportunityDto {
  @IsOptional() @IsMongoId() pipelineId?: string;
  @IsOptional() @IsMongoId() stageId?: string;
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) probability?: number;
  @IsOptional() @IsISO8601() expectedCloseDate?: string;
  @IsOptional() @IsMongoId() assignedToUserId?: string;
  @IsOptional() @IsMongoId() crmAccountId?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsString() @MaxLength(200) idempotencyKey!: string;
}

export class CreateCrmOpportunityDto extends ConvertLeadToOpportunityDto {
  @IsMongoId() leadId!: string;
}

export class UpdateCrmOpportunityDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) probability?: number;
  @IsOptional() @IsISO8601() expectedCloseDate?: string;
  @IsOptional() @IsMongoId() assignedToUserId?: string;
  @IsOptional() @IsMongoId() crmAccountId?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsEnum(CRM_OPPORTUNITY_STATUSES) status?: CrmOpportunityStatus;
}

export class MoveCrmOpportunityStageDto {
  @IsMongoId() stageId!: string;
  @IsOptional() @IsString() @MaxLength(5000) lostReason?: string;
}

export class AddCrmOpportunityNoteDto {
  @IsString() @MinLength(1) @MaxLength(5000) note!: string;
}

export class CreateCrmFollowUpDto {
  @IsEnum(CRM_FOLLOW_UP_TYPES) type!: CrmFollowUpType;
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsISO8601() dueAt!: string;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
  @IsOptional() @IsMongoId() assignedToUserId?: string;
}

export class UpdateCrmFollowUpDto {
  @IsOptional() @IsEnum(CRM_FOLLOW_UP_TYPES) type?: CrmFollowUpType;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsISO8601() dueAt?: string;
  @IsOptional() @IsString() @MaxLength(80) timezone?: string;
  @IsOptional() @IsMongoId() assignedToUserId?: string;
  @IsOptional() @IsEnum(CRM_FOLLOW_UP_STATUSES) status?: CrmFollowUpStatus;
}

export class CompleteCrmFollowUpDto {
  @IsOptional() @IsString() @MaxLength(2000) outcome?: string;
}

export class LogCrmActivityDto {
  @IsEnum(['call_logged', 'meeting_logged', 'note_added', 'other'])
  type!: Extract<CrmActivityType, 'call_logged' | 'meeting_logged' | 'note_added' | 'other'>;
  @IsOptional() @IsString() @MaxLength(5000) note?: string;
  @IsOptional() @IsISO8601() occurredAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) outcome?: string;
}
