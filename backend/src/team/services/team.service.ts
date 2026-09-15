import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { Model, Types } from 'mongoose';
import { Organization, OrganizationDocument } from '../../organizations/schemas/organization.schema';
import { Product, ProductDocument } from '../../products/schemas/product.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { AcceptInvitationDto, CreateRoleDto, InviteMemberDto, sanitizePermissions, UpdateMemberDto, UpdateProductAccessDto, UpdateRoleDto } from '../dto/team.dto';
import {
  ALL_PERMISSIONS,
  OrganizationInvitation,
  OrganizationInvitationDocument,
  OrganizationMember,
  OrganizationMemberDocument,
  OrganizationRole,
  OrganizationRoleDocument,
  PERMISSIONS,
  ProductAccessGrant,
  ProductAccessGrantDocument,
  SYSTEM_ROLE_PERMISSIONS,
  TEAM_INVITE_EXPIRY_DAYS,
  TeamAuditEvent,
  TeamAuditEventDocument,
} from '../schemas/team.schema';

export type Permission = (typeof ALL_PERMISSIONS)[number];

@Injectable()
export class AuthorizationService {
  constructor(
    @InjectModel(Organization.name) private readonly orgModel: Model<OrganizationDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(OrganizationMember.name) private readonly memberModel: Model<OrganizationMemberDocument>,
    @InjectModel(OrganizationRole.name) private readonly roleModel: Model<OrganizationRoleDocument>,
    @InjectModel(ProductAccessGrant.name) private readonly grantModel: Model<ProductAccessGrantDocument>,
  ) {}

  async ensureOwnerMembership(organizationId: string | Types.ObjectId, ownerUserId: string | Types.ObjectId) {
    const orgId = this.objectId(organizationId);
    const userId = this.objectId(ownerUserId);
    const ownerRole = await this.ensureSystemRoles(orgId, userId.toString()).then(() => this.roleModel.findOne({ organizationId: orgId, key: 'owner' }).exec());
    const existing = await this.memberModel.findOne({ organizationId: orgId, userId }).exec();
    if (existing) {
      if (existing.status !== 'active' || existing.roleId.toString() !== ownerRole!._id.toString() || existing.productAccessMode !== 'all_products') {
        existing.status = 'active';
        existing.roleId = ownerRole!._id;
        existing.productAccessMode = 'all_products';
        await existing.save();
      }
      return existing;
    }
    return new this.memberModel({ organizationId: orgId, userId, status: 'active', roleId: ownerRole!._id, productAccessMode: 'all_products', joinedAt: new Date() }).save();
  }

  async ensureSystemRoles(organizationId: string | Types.ObjectId, actorUserId?: string) {
    const orgId = this.objectId(organizationId);
    const roles = [
      { key: 'owner', name: 'Owner', description: 'Full organization access.' },
      { key: 'admin', name: 'Admin', description: 'Broad operational access.' },
      { key: 'manager', name: 'Manager', description: 'Manage growth work within product access.' },
      { key: 'editor', name: 'Editor', description: 'Create and edit content and operational data.' },
      { key: 'viewer', name: 'Viewer', description: 'Read-only access.' },
    ];
    for (const role of roles) {
      await this.roleModel.updateOne(
        { organizationId: orgId, key: role.key },
        { $setOnInsert: { organizationId: orgId, key: role.key, name: role.name, description: role.description, type: 'system', isDefault: role.key === 'viewer', permissions: SYSTEM_ROLE_PERMISSIONS[role.key] } },
        { upsert: true },
      ).exec();
    }
  }

  async access(organizationId: string, userId: string, productId?: string) {
    const org = await this.orgModel.findOne({ _id: new Types.ObjectId(organizationId) }).exec();
    if (!org) throw new NotFoundException('organization_not_found');
    await this.ensureOwnerMembership(org._id, org.ownerUserId);
    const member = await this.memberModel.findOne({ organizationId: org._id, userId: new Types.ObjectId(userId), status: 'active' }).exec();
    if (!member) throw new ForbiddenException('organization_access_denied');
    const role = await this.roleModel.findOne({ _id: member.roleId, organizationId: org._id }).lean().exec();
    if (!role) throw new ForbiddenException('role_access_denied');
    const allowedPermissions = new Set<string>(ALL_PERMISSIONS);
    const permissions = role.key === 'owner' ? ALL_PERMISSIONS : role.permissions.filter((permission) => allowedPermissions.has(permission));
    const productAccess = await this.productAccess(member);
    if (productId) await this.assertProductAccess(organizationId, productId, member);
    return { member, role, permissions, productAccess, owner: org.ownerUserId.toString() === userId };
  }

  async assertPermission(organizationId: string, userId: string, permission: string, productId?: string) {
    if (!new Set<string>(ALL_PERMISSIONS).has(permission)) throw new ForbiddenException('permission_denied');
    const access = await this.access(organizationId, userId, productId);
    if (!access.permissions.includes(permission)) throw new ForbiddenException('permission_denied');
    return access;
  }

  async assertProductAccess(organizationId: string, productId: string, memberOrUserId: OrganizationMemberDocument | string) {
    const product = await this.productModel.findOne({ _id: new Types.ObjectId(productId), organizationId: new Types.ObjectId(organizationId), status: 'active' }).exec();
    if (!product) throw new ForbiddenException('product_access_denied');
    const member = typeof memberOrUserId === 'string'
      ? await this.memberModel.findOne({ organizationId: new Types.ObjectId(organizationId), userId: new Types.ObjectId(memberOrUserId), status: 'active' }).exec()
      : memberOrUserId;
    if (!member) throw new ForbiddenException('product_access_denied');
    if (member.productAccessMode === 'all_products') return true;
    const grant = await this.grantModel.exists({ organizationId: new Types.ObjectId(organizationId), productId: product._id, memberId: member._id });
    if (!grant) throw new ForbiddenException('product_access_denied');
    return true;
  }

  async accessibleProductIds(organizationId: string, userId: string) {
    const access = await this.access(organizationId, userId);
    if (access.member.productAccessMode === 'all_products') return null;
    const grants = await this.grantModel.find({ organizationId: new Types.ObjectId(organizationId), memberId: access.member._id }).select('productId').lean().exec();
    return grants.map((grant) => grant.productId);
  }

  private async productAccess(member: OrganizationMemberDocument) {
    if (member.productAccessMode === 'all_products') return { mode: 'all_products', productIds: [] };
    const grants = await this.grantModel.find({ organizationId: member.organizationId, memberId: member._id }).select('productId').lean().exec();
    return { mode: 'selected_products', productIds: grants.map((grant) => grant.productId.toString()) };
  }

  private objectId(value: string | Types.ObjectId) {
    return value instanceof Types.ObjectId ? value : new Types.ObjectId(value);
  }
}

@Injectable()
export class OrganizationMemberService {
  constructor(
    @InjectModel(Organization.name) private readonly orgModel: Model<OrganizationDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(OrganizationMember.name) private readonly memberModel: Model<OrganizationMemberDocument>,
    @InjectModel(OrganizationRole.name) private readonly roleModel: Model<OrganizationRoleDocument>,
    @InjectModel(ProductAccessGrant.name) private readonly grantModel: Model<ProductAccessGrantDocument>,
    @InjectModel(TeamAuditEvent.name) private readonly auditModel: Model<TeamAuditEventDocument>,
    private readonly authz: AuthorizationService,
  ) {}

  async currentAccess(organizationId: string, userId: string) {
    const access = await this.authz.access(organizationId, userId);
    return this.accessDto(access);
  }

  async list(organizationId: string, userId: string) {
    await this.authz.assertPermission(organizationId, userId, PERMISSIONS.TEAM_VIEW);
    await this.bootstrapOwner(organizationId);
    const [members, users, roles] = await Promise.all([
      this.memberModel.find({ organizationId: new Types.ObjectId(organizationId), status: { $ne: 'removed' } as any }).sort({ joinedAt: -1 }).lean().exec(),
      this.userModel.find().select('name email status').lean().exec(),
      this.roleModel.find({ organizationId: new Types.ObjectId(organizationId) }).lean().exec(),
    ]);
    const userMap = new Map(users.map((user: any) => [user._id.toString(), user]));
    const roleMap = new Map(roles.map((role: any) => [role._id.toString(), role]));
    const grants = await this.grantModel.find({ organizationId: new Types.ObjectId(organizationId), memberId: { $in: members.map((member: any) => member._id) } }).lean().exec();
    return members.map((member: any) => this.memberDto(member, userMap.get(member.userId.toString()), roleMap.get(member.roleId.toString()), grants.filter((grant: any) => grant.memberId.toString() === member._id.toString())));
  }

  async get(organizationId: string, userId: string, memberId: string) {
    await this.authz.assertPermission(organizationId, userId, PERMISSIONS.TEAM_VIEW);
    const member = await this.findMember(organizationId, memberId);
    const [user, role, grants] = await Promise.all([
      this.userModel.findOne({ _id: member.userId }).select('name email status').lean().exec(),
      this.roleModel.findOne({ _id: member.roleId }).lean().exec(),
      this.grantModel.find({ organizationId: member.organizationId, memberId: member._id }).lean().exec(),
    ]);
    return this.memberDto(member, user, role, grants);
  }

  async update(organizationId: string, userId: string, memberId: string, dto: UpdateMemberDto) {
    await this.authz.assertPermission(organizationId, userId, PERMISSIONS.TEAM_MANAGE);
    if (dto.roleId) await this.authz.assertPermission(organizationId, userId, PERMISSIONS.TEAM_ROLES_MANAGE);
    const member = await this.findMember(organizationId, memberId);
    if (dto.roleId && member.userId.toString() === userId) throw new ForbiddenException('self_escalation_denied');
    await this.assertOwnerContinuity(organizationId, member, dto.roleId, dto.status);
    const previous = { roleId: member.roleId.toString(), status: member.status };
    if (dto.roleId) {
      const role = await this.roleModel.findOne({ _id: new Types.ObjectId(dto.roleId), organizationId: new Types.ObjectId(organizationId) }).exec();
      if (!role) throw new BadRequestException('role_not_found');
      member.roleId = role._id;
    }
    if (dto.status) member.status = dto.status;
    await member.save();
    await this.audit(organizationId, userId, 'member_changed', 'member', member._id.toString(), { previous, next: { roleId: member.roleId.toString(), status: member.status } });
    return this.get(organizationId, userId, memberId);
  }

  suspend(organizationId: string, userId: string, memberId: string) {
    return this.update(organizationId, userId, memberId, { status: 'suspended' });
  }

  reactivate(organizationId: string, userId: string, memberId: string) {
    return this.update(organizationId, userId, memberId, { status: 'active' });
  }

  remove(organizationId: string, userId: string, memberId: string) {
    return this.update(organizationId, userId, memberId, { status: 'removed' });
  }

  async productAccess(organizationId: string, userId: string, memberId: string) {
    await this.authz.assertPermission(organizationId, userId, PERMISSIONS.TEAM_VIEW);
    const member = await this.findMember(organizationId, memberId);
    const grants = await this.grantModel.find({ organizationId: member.organizationId, memberId: member._id }).lean().exec();
    return { mode: member.productAccessMode, productIds: grants.map((grant: any) => grant.productId.toString()) };
  }

  async updateProductAccess(organizationId: string, userId: string, memberId: string, dto: UpdateProductAccessDto) {
    await this.authz.assertPermission(organizationId, userId, PERMISSIONS.TEAM_MANAGE);
    const member = await this.findMember(organizationId, memberId);
    const role = await this.roleModel.findOne({ _id: member.roleId }).lean().exec();
    if (role?.key === 'owner' && dto.mode !== 'all_products') throw new ConflictException('owner_requires_all_products');
    member.productAccessMode = dto.mode;
    await member.save();
    await this.grantModel.deleteMany({ organizationId: member.organizationId, memberId: member._id }).exec();
    if (dto.mode === 'selected_products') {
      const productIds = [...new Set(dto.productIds || [])];
      const count = await this.productModel.countDocuments({ organizationId: member.organizationId, _id: { $in: productIds.filter(Types.ObjectId.isValid).map((id) => new Types.ObjectId(id)) } }).exec();
      if (count !== productIds.length) throw new BadRequestException('foreign_product_access_denied');
      if (productIds.length) await this.grantModel.insertMany(productIds.map((productId) => ({ organizationId: member.organizationId, productId: new Types.ObjectId(productId), memberId: member._id, accessLevel: 'explicit', createdByUserId: new Types.ObjectId(userId) })));
    }
    await this.audit(organizationId, userId, 'product_access_changed', 'member', memberId, { mode: dto.mode, productIds: dto.productIds || [] });
    return this.productAccess(organizationId, userId, memberId);
  }

  private async bootstrapOwner(organizationId: string) {
    const org = await this.orgModel.findOne({ _id: new Types.ObjectId(organizationId) }).exec();
    if (org) await this.authz.ensureOwnerMembership(org._id, org.ownerUserId);
  }

  private async findMember(organizationId: string, memberId: string) {
    const member = await this.memberModel.findOne({ _id: new Types.ObjectId(memberId), organizationId: new Types.ObjectId(organizationId) }).exec();
    if (!member) throw new NotFoundException('member_not_found');
    return member;
  }

  private async assertOwnerContinuity(organizationId: string, member: OrganizationMemberDocument, nextRoleId?: string, nextStatus?: string) {
    const role = await this.roleModel.findOne({ _id: member.roleId }).lean().exec();
    if (role?.key !== 'owner') return;
    const ownerRole = await this.roleModel.findOne({ organizationId: new Types.ObjectId(organizationId), key: 'owner' }).lean().exec();
    const activeOwners = await this.memberModel.countDocuments({ organizationId: new Types.ObjectId(organizationId), roleId: ownerRole?._id, status: 'active' }).exec();
    const wouldDemote = nextRoleId && nextRoleId !== member.roleId.toString();
    const wouldDeactivate = nextStatus && nextStatus !== 'active';
    if (activeOwners <= 1 && (wouldDemote || wouldDeactivate)) throw new ConflictException('sole_owner_protected');
  }

  private memberDto(member: any, user: any, role: any, grants: any[]) {
    return {
      memberId: member._id.toString(),
      userId: member.userId.toString(),
      displayName: user?.name || user?.email || 'Member',
      email: user?.email,
      role: role ? { id: role._id.toString(), key: role.key, name: role.name, type: role.type, permissions: role.permissions } : undefined,
      status: member.status,
      joinedAt: member.joinedAt,
      productAccessMode: member.productAccessMode,
      productAccessSummary: member.productAccessMode === 'all_products' ? 'All products' : `${grants.length} selected product(s)`,
      productIds: grants.map((grant: any) => grant.productId.toString()),
    };
  }

  private accessDto(access: any) {
    return {
      member: { memberId: access.member._id.toString(), status: access.member.status, productAccessMode: access.member.productAccessMode },
      role: { id: access.role._id.toString(), key: access.role.key, name: access.role.name, type: access.role.type },
      permissions: access.permissions,
      productAccess: access.productAccess,
    };
  }

  private async audit(organizationId: string, actorUserId: string, eventType: string, targetType: string, targetId: string, metadata: Record<string, unknown>) {
    await this.auditModel.create({ organizationId: new Types.ObjectId(organizationId), eventType, actorUserId: new Types.ObjectId(actorUserId), targetType, targetId, metadata });
  }
}

@Injectable()
export class RoleService {
  constructor(
    @InjectModel(Organization.name) private readonly orgModel: Model<OrganizationDocument>,
    @InjectModel(OrganizationRole.name) private readonly roleModel: Model<OrganizationRoleDocument>,
    @InjectModel(OrganizationMember.name) private readonly memberModel: Model<OrganizationMemberDocument>,
    @InjectModel(TeamAuditEvent.name) private readonly auditModel: Model<TeamAuditEventDocument>,
    private readonly authz: AuthorizationService,
  ) {}

  async list(organizationId: string, userId: string) {
    await this.authz.assertPermission(organizationId, userId, PERMISSIONS.TEAM_VIEW);
    await this.authz.ensureSystemRoles(organizationId, userId);
    const [roles, members] = await Promise.all([
      this.roleModel.find({ organizationId: new Types.ObjectId(organizationId) }).sort({ type: -1, name: 1 }).lean().exec(),
      this.memberModel.aggregate([{ $match: { organizationId: new Types.ObjectId(organizationId), status: 'active' } }, { $group: { _id: '$roleId', count: { $sum: 1 } } }]).exec(),
    ]);
    const counts = new Map(members.map((item: any) => [item._id.toString(), item.count]));
    return roles.map((role: any) => ({ ...role, id: role._id.toString(), membersCount: counts.get(role._id.toString()) || 0 }));
  }

  async create(organizationId: string, userId: string, dto: CreateRoleDto) {
    await this.authz.assertPermission(organizationId, userId, PERMISSIONS.TEAM_ROLES_MANAGE);
    const key = this.key(dto.name);
    if (SYSTEM_ROLE_PERMISSIONS[key]) throw new ConflictException('system_role_key_reserved');
    if (dto.isDefault) await this.roleModel.updateMany({ organizationId: new Types.ObjectId(organizationId) }, { $set: { isDefault: false } }).exec();
    const role = await this.roleModel.create({ organizationId: new Types.ObjectId(organizationId), name: dto.name.trim(), key, description: dto.description?.trim(), type: 'custom', isDefault: !!dto.isDefault, permissions: sanitizePermissions(dto.permissions) });
    await this.audit(organizationId, userId, 'custom_role_created', role._id.toString(), { key });
    return role;
  }

  async update(organizationId: string, userId: string, roleId: string, dto: UpdateRoleDto) {
    await this.authz.assertPermission(organizationId, userId, PERMISSIONS.TEAM_ROLES_MANAGE);
    const role = await this.roleModel.findOne({ _id: new Types.ObjectId(roleId), organizationId: new Types.ObjectId(organizationId) }).exec();
    if (!role) throw new NotFoundException('role_not_found');
    if (role.type === 'system' && (dto.permissions || dto.name)) throw new ConflictException('system_role_immutable');
    if (dto.name) role.name = dto.name.trim();
    if (dto.description !== undefined) role.description = dto.description.trim();
    if (dto.permissions) role.permissions = sanitizePermissions(dto.permissions);
    if (dto.isDefault !== undefined) {
      if (role.key === 'admin' || role.key === 'owner') throw new ConflictException('default_role_cannot_be_admin');
      if (dto.isDefault) await this.roleModel.updateMany({ organizationId: role.organizationId }, { $set: { isDefault: false } }).exec();
      role.isDefault = dto.isDefault;
    }
    await role.save();
    await this.audit(organizationId, userId, 'custom_role_changed', roleId, {});
    return role;
  }

  async delete(organizationId: string, userId: string, roleId: string) {
    await this.authz.assertPermission(organizationId, userId, PERMISSIONS.TEAM_ROLES_MANAGE);
    const role = await this.roleModel.findOne({ _id: new Types.ObjectId(roleId), organizationId: new Types.ObjectId(organizationId) }).exec();
    if (!role) throw new NotFoundException('role_not_found');
    if (role.type === 'system') throw new ConflictException('system_role_immutable');
    const inUse = await this.memberModel.exists({ organizationId: role.organizationId, roleId: role._id, status: 'active' });
    if (inUse) throw new ConflictException('role_in_use');
    await role.deleteOne();
    await this.audit(organizationId, userId, 'custom_role_deleted', roleId, {});
    return { status: 'deleted' };
  }

  private key(name: string) {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  }

  private async audit(organizationId: string, actorUserId: string, eventType: string, targetId: string, metadata: Record<string, unknown>) {
    await this.auditModel.create({ organizationId: new Types.ObjectId(organizationId), eventType, actorUserId: new Types.ObjectId(actorUserId), targetType: 'role', targetId, metadata });
  }
}

@Injectable()
export class InvitationService {
  constructor(
    @InjectModel(Organization.name) private readonly orgModel: Model<OrganizationDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(OrganizationMember.name) private readonly memberModel: Model<OrganizationMemberDocument>,
    @InjectModel(OrganizationRole.name) private readonly roleModel: Model<OrganizationRoleDocument>,
    @InjectModel(OrganizationInvitation.name) private readonly invitationModel: Model<OrganizationInvitationDocument>,
    @InjectModel(ProductAccessGrant.name) private readonly grantModel: Model<ProductAccessGrantDocument>,
    @InjectModel(TeamAuditEvent.name) private readonly auditModel: Model<TeamAuditEventDocument>,
    private readonly authz: AuthorizationService,
  ) {}

  async list(organizationId: string, userId: string) {
    await this.authz.assertPermission(organizationId, userId, PERMISSIONS.TEAM_INVITE);
    return this.invitationModel.find({ organizationId: new Types.ObjectId(organizationId) }).sort({ createdAt: -1 }).limit(100).lean().exec();
  }

  async create(organizationId: string, userId: string, dto: InviteMemberDto) {
    await this.authz.assertPermission(organizationId, userId, PERMISSIONS.TEAM_INVITE);
    const email = this.email(dto.email);
    const role = await this.roleModel.findOne({ _id: new Types.ObjectId(dto.roleId), organizationId: new Types.ObjectId(organizationId) }).exec();
    if (!role) throw new BadRequestException('role_not_found');
    const existingUser = await this.userModel.findOne({ email }).exec();
    if (existingUser && await this.memberModel.exists({ organizationId: new Types.ObjectId(organizationId), userId: existingUser._id, status: 'active' })) throw new ConflictException('member_already_exists');
    const pending = await this.invitationModel.findOne({ organizationId: new Types.ObjectId(organizationId), emailNormalized: email, status: 'pending' }).exec();
    if (pending) throw new ConflictException('pending_invitation_exists');
    await this.validateProducts(organizationId, dto.productAccessMode, dto.productIds || []);
    const token = this.token();
    const invite = await this.invitationModel.create({ organizationId: new Types.ObjectId(organizationId), emailNormalized: email, roleId: role._id, productAccessMode: dto.productAccessMode, productIds: dto.productAccessMode === 'selected_products' ? dto.productIds || [] : [], status: 'pending', tokenHash: this.hash(token), invitedByUserId: new Types.ObjectId(userId), expiresAt: new Date(Date.now() + TEAM_INVITE_EXPIRY_DAYS * 86400000) });
    await this.audit(organizationId, userId, 'invite_created', invite._id.toString(), { email, emailStatus: 'mocked' });
    return { ...invite.toObject(), inviteUrl: this.inviteUrl(token), notification: { email: 'mocked' } };
  }

  async resend(organizationId: string, userId: string, invitationId: string) {
    await this.authz.assertPermission(organizationId, userId, PERMISSIONS.TEAM_INVITE);
    const invite = await this.findInvitation(organizationId, invitationId);
    if (invite.status !== 'pending') throw new ConflictException('invitation_not_pending');
    const token = this.token();
    invite.tokenHash = this.hash(token);
    invite.expiresAt = new Date(Date.now() + TEAM_INVITE_EXPIRY_DAYS * 86400000);
    await invite.save();
    await this.audit(organizationId, userId, 'invite_resent', invite._id.toString(), { email: invite.emailNormalized, emailStatus: 'mocked' });
    return { ...invite.toObject(), inviteUrl: this.inviteUrl(token), notification: { email: 'mocked' } };
  }

  async revoke(organizationId: string, userId: string, invitationId: string) {
    await this.authz.assertPermission(organizationId, userId, PERMISSIONS.TEAM_INVITE);
    const invite = await this.findInvitation(organizationId, invitationId);
    if (invite.status !== 'pending') throw new ConflictException('invitation_not_pending');
    invite.status = 'revoked';
    invite.revokedAt = new Date();
    await invite.save();
    await this.audit(organizationId, userId, 'invite_revoked', invite._id.toString(), { email: invite.emailNormalized });
    return invite;
  }

  async accept(userId: string, dto: AcceptInvitationDto) {
    const tokenHash = this.hash(dto.token);
    const invite = await this.invitationModel.findOne({ tokenHash }).exec();
    if (!invite || !this.safeEqual(tokenHash, invite.tokenHash)) throw new NotFoundException('invitation_not_found');
    if (invite.status !== 'pending') throw new ConflictException(`invitation_${invite.status}`);
    if (invite.expiresAt.getTime() < Date.now()) {
      invite.status = 'expired';
      await invite.save();
      throw new ConflictException('invitation_expired');
    }
    const user = await this.userModel.findOne({ _id: new Types.ObjectId(userId), status: 'active' }).exec();
    if (!user || this.email(user.email) !== invite.emailNormalized) throw new ForbiddenException('invitation_email_mismatch');
    let member = await this.memberModel.findOne({ organizationId: invite.organizationId, userId: user._id }).exec();
    if (!member) {
      member = await this.memberModel.create({ organizationId: invite.organizationId, userId: user._id, status: 'active', roleId: invite.roleId, productAccessMode: invite.productAccessMode, joinedAt: new Date(), invitedByUserId: invite.invitedByUserId });
    } else if (member.status !== 'active') {
      member.status = 'active';
      member.roleId = invite.roleId;
      member.productAccessMode = invite.productAccessMode;
      await member.save();
    }
    await this.grantModel.deleteMany({ organizationId: invite.organizationId, memberId: member._id }).exec();
    if (invite.productAccessMode === 'selected_products' && invite.productIds.length) {
      await this.grantModel.insertMany(invite.productIds.map((productId) => ({ organizationId: invite.organizationId, productId: new Types.ObjectId(productId), memberId: member!._id, accessLevel: 'explicit', createdByUserId: invite.invitedByUserId })));
    }
    invite.status = 'accepted';
    invite.acceptedByUserId = user._id;
    invite.acceptedAt = new Date();
    await invite.save();
    await this.audit(invite.organizationId.toString(), userId, 'invite_accepted', invite._id.toString(), { email: invite.emailNormalized });
    return { organizationId: invite.organizationId.toString(), memberId: member._id.toString(), status: 'accepted' };
  }

  async preview(token: string) {
    const invite = await this.invitationModel.findOne({ tokenHash: this.hash(token) }).lean().exec();
    if (!invite) throw new NotFoundException('invitation_not_found');
    const [org, role] = await Promise.all([
      this.orgModel.findOne({ _id: invite.organizationId }).select('name slug').lean().exec(),
      this.roleModel.findOne({ _id: invite.roleId }).select('name key').lean().exec(),
    ]);
    return { organization: org, role, email: invite.emailNormalized, productAccessMode: invite.productAccessMode, productIds: invite.productIds, status: invite.status, expiresAt: invite.expiresAt };
  }

  private async validateProducts(organizationId: string, mode: string, productIds: string[]) {
    if (mode !== 'selected_products') return;
    const clean = [...new Set(productIds)];
    const count = await this.productModel.countDocuments({ organizationId: new Types.ObjectId(organizationId), _id: { $in: clean.filter(Types.ObjectId.isValid).map((id) => new Types.ObjectId(id)) } }).exec();
    if (count !== clean.length) throw new BadRequestException('foreign_product_access_denied');
  }

  private async findInvitation(organizationId: string, invitationId: string) {
    const invite = await this.invitationModel.findOne({ _id: new Types.ObjectId(invitationId), organizationId: new Types.ObjectId(organizationId) }).exec();
    if (!invite) throw new NotFoundException('invitation_not_found');
    return invite;
  }

  private token() {
    return randomBytes(32).toString('base64url');
  }

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private safeEqual(a: string, b: string) {
    return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  private email(email: string) {
    return email.trim().toLowerCase();
  }

  private inviteUrl(token: string) {
    const base = process.env.FRONTEND_BASE_URL || '';
    return `${base}/invite/accept?token=${encodeURIComponent(token)}`;
  }

  private async audit(organizationId: string, actorUserId: string, eventType: string, targetId: string, metadata: Record<string, unknown>) {
    await this.auditModel.create({ organizationId: new Types.ObjectId(organizationId), eventType, actorUserId: new Types.ObjectId(actorUserId), targetType: 'invitation', targetId, metadata });
  }
}
