import { IsArray, IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ALL_PERMISSIONS, MEMBER_STATUSES, PRODUCT_ACCESS_MODES } from '../schemas/team.schema';

export class InviteMemberDto {
  @IsEmail()
  email: string;

  @IsString()
  roleId: string;

  @IsIn(PRODUCT_ACCESS_MODES)
  productAccessMode: 'all_products' | 'selected_products';

  @IsOptional()
  @IsArray()
  productIds?: string[];
}

export class UpdateMemberDto {
  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsIn(MEMBER_STATUSES)
  status?: 'active' | 'suspended' | 'removed';
}

export class UpdateProductAccessDto {
  @IsIn(PRODUCT_ACCESS_MODES)
  mode: 'all_products' | 'selected_products';

  @IsOptional()
  @IsArray()
  productIds?: string[];
}

export class CreateRoleDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  permissions: string[];

  @IsOptional()
  isDefault?: boolean;
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsArray()
  permissions?: string[];

  @IsOptional()
  isDefault?: boolean;
}

export class AcceptInvitationDto {
  @IsString()
  token: string;
}

export function sanitizePermissions(permissions: string[]) {
  const allowed = new Set<string>(ALL_PERMISSIONS);
  return [...new Set((permissions || []).filter((permission) => allowed.has(permission)))];
}
