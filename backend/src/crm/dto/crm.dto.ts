import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsISO8601, IsMongoId, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CRM_OPPORTUNITY_STATUSES, CRM_STAGE_CATEGORIES } from '../types/crm.types';
import type { CrmOpportunityStatus, CrmStageCategory } from '../types/crm.types';

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
