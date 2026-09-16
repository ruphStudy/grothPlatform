import { IsOptional, IsString } from 'class-validator';

export class AuditLogQueryDto {
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() resourceType?: string;
  @IsOptional() @IsString() actorUserId?: string;
  @IsOptional() @IsString() result?: 'success' | 'failure';
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() productId?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() limit?: string;
}
