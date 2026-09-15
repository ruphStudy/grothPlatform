import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AcceptInvitationDto, CreateRoleDto, InviteMemberDto, UpdateMemberDto, UpdateProductAccessDto, UpdateRoleDto } from './dto/team.dto';
import { ALL_PERMISSIONS, PERMISSIONS } from './schemas/team.schema';
import { InvitationService, OrganizationMemberService, RoleService } from './services/team.service';

@UseGuards(JwtAuthGuard)
@Controller('organizations/:organizationId')
export class TeamController {
  constructor(
    private readonly members: OrganizationMemberService,
    private readonly invitations: InvitationService,
    private readonly roles: RoleService,
  ) {}

  @Get('me/access')
  access(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string) {
    return this.members.currentAccess(organizationId, req.user.userId);
  }

  @Get('permissions')
  permissions() {
    return { permissions: ALL_PERMISSIONS, registry: PERMISSIONS };
  }

  @Get('members')
  listMembers(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string) {
    return this.members.list(organizationId, req.user.userId);
  }

  @Get('members/:memberId')
  getMember(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('memberId') memberId: string) {
    return this.members.get(organizationId, req.user.userId, memberId);
  }

  @Patch('members/:memberId')
  updateMember(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('memberId') memberId: string, @Body() dto: UpdateMemberDto) {
    return this.members.update(organizationId, req.user.userId, memberId, dto);
  }

  @Post('members/:memberId/suspend')
  suspend(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('memberId') memberId: string) {
    return this.members.suspend(organizationId, req.user.userId, memberId);
  }

  @Post('members/:memberId/reactivate')
  reactivate(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('memberId') memberId: string) {
    return this.members.reactivate(organizationId, req.user.userId, memberId);
  }

  @Delete('members/:memberId')
  remove(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('memberId') memberId: string) {
    return this.members.remove(organizationId, req.user.userId, memberId);
  }

  @Get('members/:memberId/product-access')
  productAccess(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('memberId') memberId: string) {
    return this.members.productAccess(organizationId, req.user.userId, memberId);
  }

  @Patch('members/:memberId/product-access')
  updateProductAccess(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('memberId') memberId: string, @Body() dto: UpdateProductAccessDto) {
    return this.members.updateProductAccess(organizationId, req.user.userId, memberId, dto);
  }

  @Get('invitations')
  listInvites(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string) {
    return this.invitations.list(organizationId, req.user.userId);
  }

  @Post('invitations')
  invite(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Body() dto: InviteMemberDto) {
    return this.invitations.create(organizationId, req.user.userId, dto);
  }

  @Post('invitations/:invitationId/resend')
  resend(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('invitationId') invitationId: string) {
    return this.invitations.resend(organizationId, req.user.userId, invitationId);
  }

  @Post('invitations/:invitationId/revoke')
  revoke(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('invitationId') invitationId: string) {
    return this.invitations.revoke(organizationId, req.user.userId, invitationId);
  }

  @Get('roles')
  rolesList(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string) {
    return this.roles.list(organizationId, req.user.userId);
  }

  @Post('roles')
  createRole(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Body() dto: CreateRoleDto) {
    return this.roles.create(organizationId, req.user.userId, dto);
  }

  @Patch('roles/:roleId')
  updateRole(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('roleId') roleId: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(organizationId, req.user.userId, roleId, dto);
  }

  @Delete('roles/:roleId')
  deleteRole(@Req() req: { user: { userId: string } }, @Param('organizationId') organizationId: string, @Param('roleId') roleId: string) {
    return this.roles.delete(organizationId, req.user.userId, roleId);
  }
}

@Controller('invitations')
export class InvitationPublicController {
  constructor(private readonly invitations: InvitationService) {}

  @Get('preview/:token')
  preview(@Param('token') token: string) {
    return this.invitations.preview(token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('accept')
  accept(@Req() req: { user: { userId: string } }, @Body() dto: AcceptInvitationDto) {
    return this.invitations.accept(req.user.userId, dto);
  }
}
