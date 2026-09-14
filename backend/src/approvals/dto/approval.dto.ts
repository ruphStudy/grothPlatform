import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { APPROVAL_POLICIES, APPROVAL_PRIORITIES, APPROVAL_REQUEST_STATUSES, APPROVAL_TARGET_TYPES } from '../schemas/approval.schema';

export class CreateApprovalRequestDto {
  @IsIn(APPROVAL_TARGET_TYPES)
  targetType: string;

  @IsString()
  targetId: string;

  @IsOptional()
  @IsString()
  targetVersionId?: string;

  @IsOptional()
  @IsString()
  reasonCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reasonText?: string;

  @IsOptional()
  @IsIn(APPROVAL_PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsIn(APPROVAL_POLICIES)
  approvalPolicy?: string;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;
}

export class ApprovalDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}

export class ApprovalQueueQueryDto {
  @IsOptional()
  @IsIn(APPROVAL_TARGET_TYPES)
  targetType?: string;

  @IsOptional()
  @IsIn(APPROVAL_PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsIn(APPROVAL_POLICIES)
  policy?: string;

  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsOptional()
  @IsIn(APPROVAL_REQUEST_STATUSES)
  status?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
