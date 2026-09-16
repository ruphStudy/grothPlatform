import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const MEMBER_STATUSES = ['active', 'suspended', 'removed'] as const;
export const INVITATION_STATUSES = ['pending', 'accepted', 'declined', 'expired', 'revoked'] as const;
export const PRODUCT_ACCESS_MODES = ['all_products', 'selected_products'] as const;
export const ROLE_TYPES = ['system', 'custom'] as const;
export const TEAM_INVITE_EXPIRY_DAYS = Number(process.env.TEAM_INVITE_EXPIRY_DAYS || 7);

export const PERMISSIONS = {
  ORGANIZATION_VIEW: 'organization.view',
  ORGANIZATION_MANAGE: 'organization.manage',
  TEAM_VIEW: 'team.view',
  TEAM_MANAGE: 'team.manage',
  TEAM_INVITE: 'team.invite',
  TEAM_ROLES_MANAGE: 'team.roles.manage',
  AUDIT_VIEW: 'audit.view',
  PRODUCT_VIEW: 'product.view',
  PRODUCT_CREATE: 'product.create',
  PRODUCT_MANAGE: 'product.manage',
  PRODUCT_DELETE: 'product.delete',
  STRATEGY_VIEW: 'strategy.view',
  STRATEGY_MANAGE: 'strategy.manage',
  STRATEGY_APPROVE: 'strategy.approve',
  CAMPAIGN_VIEW: 'campaign.view',
  CAMPAIGN_MANAGE: 'campaign.manage',
  CAMPAIGN_APPROVE: 'campaign.approve',
  CONTENT_VIEW: 'content.view',
  CONTENT_CREATE: 'content.create',
  CONTENT_EDIT: 'content.edit',
  CONTENT_GENERATE: 'content.generate',
  CONTENT_APPROVE: 'content.approve',
  CONTENT_PUBLISH: 'content.publish',
  CREATIVE_VIEW: 'creative.view',
  CREATIVE_MANAGE: 'creative.manage',
  CREATIVE_APPROVE: 'creative.approve',
  SOCIAL_VIEW: 'social.view',
  SOCIAL_MANAGE_CONNECTIONS: 'social.manage_connections',
  SOCIAL_PUBLISH: 'social.publish',
  CMS_VIEW: 'cms.view',
  CMS_MANAGE_CONNECTIONS: 'cms.manage_connections',
  CMS_PUBLISH: 'cms.publish',
  LEADS_VIEW: 'leads.view',
  LEADS_MANAGE: 'leads.manage',
  LEADS_EXPORT: 'leads.export',
  CRM_VIEW: 'crm.view',
  CRM_MANAGE: 'crm.manage',
  CRM_EXPORT: 'crm.export',
  EMAIL_VIEW: 'email.view',
  EMAIL_MANAGE: 'email.manage',
  EMAIL_SEND: 'email.send',
  EMAIL_MANAGE_CONNECTIONS: 'email.manage_connections',
  ANALYTICS_VIEW: 'analytics.view',
  ATTRIBUTION_VIEW: 'attribution.view',
  LEARNING_VIEW: 'learning.view',
  LEARNING_RUN: 'learning.run',
  LEARNING_MANAGE: 'learning.manage',
  GROWTH_BRAIN_VIEW: 'growth_brain.view',
  GROWTH_BRAIN_RUN: 'growth_brain.run',
  APPROVAL_VIEW: 'approval.view',
  APPROVAL_REQUEST: 'approval.request',
  APPROVAL_DECIDE: 'approval.decide',
  NOTIFICATIONS_VIEW: 'notifications.view',
  BILLING_VIEW: 'billing.view',
  BILLING_MANAGE: 'billing.manage',
} as const;

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export const SYSTEM_ROLE_PERMISSIONS: Record<string, string[]> = {
  owner: [...ALL_PERMISSIONS],
  admin: ALL_PERMISSIONS.filter((permission) => permission !== PERMISSIONS.BILLING_MANAGE),
  manager: [
    PERMISSIONS.ORGANIZATION_VIEW, PERMISSIONS.TEAM_VIEW, PERMISSIONS.AUDIT_VIEW, PERMISSIONS.PRODUCT_VIEW, PERMISSIONS.PRODUCT_CREATE, PERMISSIONS.PRODUCT_MANAGE,
    PERMISSIONS.STRATEGY_VIEW, PERMISSIONS.STRATEGY_MANAGE, PERMISSIONS.CAMPAIGN_VIEW, PERMISSIONS.CAMPAIGN_MANAGE, PERMISSIONS.CAMPAIGN_APPROVE,
    PERMISSIONS.CONTENT_VIEW, PERMISSIONS.CONTENT_CREATE, PERMISSIONS.CONTENT_EDIT, PERMISSIONS.CONTENT_GENERATE, PERMISSIONS.CONTENT_APPROVE, PERMISSIONS.CONTENT_PUBLISH,
    PERMISSIONS.CREATIVE_VIEW, PERMISSIONS.CREATIVE_MANAGE, PERMISSIONS.SOCIAL_VIEW, PERMISSIONS.CMS_VIEW, PERMISSIONS.LEADS_VIEW, PERMISSIONS.LEADS_MANAGE,
    PERMISSIONS.CRM_VIEW, PERMISSIONS.CRM_MANAGE, PERMISSIONS.EMAIL_VIEW, PERMISSIONS.EMAIL_MANAGE, PERMISSIONS.EMAIL_SEND, PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.ATTRIBUTION_VIEW, PERMISSIONS.LEARNING_VIEW, PERMISSIONS.LEARNING_RUN, PERMISSIONS.GROWTH_BRAIN_VIEW, PERMISSIONS.GROWTH_BRAIN_RUN,
    PERMISSIONS.APPROVAL_VIEW, PERMISSIONS.APPROVAL_REQUEST, PERMISSIONS.APPROVAL_DECIDE, PERMISSIONS.NOTIFICATIONS_VIEW,
  ],
  editor: [
    PERMISSIONS.ORGANIZATION_VIEW, PERMISSIONS.PRODUCT_VIEW, PERMISSIONS.STRATEGY_VIEW, PERMISSIONS.CAMPAIGN_VIEW,
    PERMISSIONS.CONTENT_VIEW, PERMISSIONS.CONTENT_CREATE, PERMISSIONS.CONTENT_EDIT, PERMISSIONS.CONTENT_GENERATE, PERMISSIONS.CREATIVE_VIEW,
    PERMISSIONS.CREATIVE_MANAGE, PERMISSIONS.SOCIAL_VIEW, PERMISSIONS.CMS_VIEW, PERMISSIONS.LEADS_VIEW, PERMISSIONS.CRM_VIEW, PERMISSIONS.EMAIL_VIEW,
    PERMISSIONS.ANALYTICS_VIEW, PERMISSIONS.ATTRIBUTION_VIEW, PERMISSIONS.LEARNING_VIEW, PERMISSIONS.GROWTH_BRAIN_VIEW, PERMISSIONS.APPROVAL_VIEW,
    PERMISSIONS.APPROVAL_REQUEST, PERMISSIONS.NOTIFICATIONS_VIEW,
  ],
  viewer: [
    PERMISSIONS.ORGANIZATION_VIEW, PERMISSIONS.PRODUCT_VIEW, PERMISSIONS.STRATEGY_VIEW, PERMISSIONS.CAMPAIGN_VIEW, PERMISSIONS.CONTENT_VIEW,
    PERMISSIONS.CREATIVE_VIEW, PERMISSIONS.SOCIAL_VIEW, PERMISSIONS.CMS_VIEW, PERMISSIONS.LEADS_VIEW, PERMISSIONS.CRM_VIEW, PERMISSIONS.EMAIL_VIEW,
    PERMISSIONS.ANALYTICS_VIEW, PERMISSIONS.ATTRIBUTION_VIEW, PERMISSIONS.LEARNING_VIEW, PERMISSIONS.GROWTH_BRAIN_VIEW, PERMISSIONS.APPROVAL_VIEW,
    PERMISSIONS.NOTIFICATIONS_VIEW,
  ],
};

export type OrganizationMemberDocument = HydratedDocument<OrganizationMember>;
export type OrganizationInvitationDocument = HydratedDocument<OrganizationInvitation>;
export type OrganizationRoleDocument = HydratedDocument<OrganizationRole>;
export type ProductAccessGrantDocument = HydratedDocument<ProductAccessGrant>;
export type TeamAuditEventDocument = HydratedDocument<TeamAuditEvent>;

@Schema({ timestamps: true })
export class OrganizationRole {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true, maxlength: 120 })
  name: string;

  @Prop({ required: true, maxlength: 80 })
  key: string;

  @Prop({ maxlength: 500 })
  description?: string;

  @Prop({ type: String, enum: ROLE_TYPES, required: true, default: 'custom' })
  type: (typeof ROLE_TYPES)[number];

  @Prop({ type: Boolean, default: false })
  isDefault?: boolean;

  @Prop({ type: [String], default: [] })
  permissions: string[];

  createdAt?: Date;
  updatedAt?: Date;
}
export const OrganizationRoleSchema = SchemaFactory.createForClass(OrganizationRole);
OrganizationRoleSchema.index({ organizationId: 1, key: 1 }, { unique: true });

@Schema({ timestamps: true })
export class OrganizationMember {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: MEMBER_STATUSES, required: true, default: 'active' })
  status: (typeof MEMBER_STATUSES)[number];

  @Prop({ type: Types.ObjectId, required: true })
  roleId: Types.ObjectId;

  @Prop({ type: String, enum: PRODUCT_ACCESS_MODES, required: true, default: 'selected_products' })
  productAccessMode: (typeof PRODUCT_ACCESS_MODES)[number];

  @Prop({ required: true })
  joinedAt: Date;

  @Prop({ type: Types.ObjectId })
  invitedByUserId?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}
export const OrganizationMemberSchema = SchemaFactory.createForClass(OrganizationMember);
OrganizationMemberSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
OrganizationMemberSchema.index({ organizationId: 1, status: 1 });
OrganizationMemberSchema.index({ userId: 1, status: 1 });

@Schema({ timestamps: true })
export class ProductAccessGrant {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  productId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  memberId: Types.ObjectId;

  @Prop({ required: true, default: 'explicit' })
  accessLevel: 'inherited' | 'explicit';

  @Prop({ type: Types.ObjectId })
  createdByUserId?: Types.ObjectId;

  createdAt?: Date;
}
export const ProductAccessGrantSchema = SchemaFactory.createForClass(ProductAccessGrant);
ProductAccessGrantSchema.index({ organizationId: 1, memberId: 1 });
ProductAccessGrantSchema.index({ memberId: 1, productId: 1 }, { unique: true });

@Schema({ timestamps: true })
export class OrganizationInvitation {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ required: true })
  emailNormalized: string;

  @Prop({ type: Types.ObjectId, required: true })
  roleId: Types.ObjectId;

  @Prop({ type: String, enum: PRODUCT_ACCESS_MODES, required: true })
  productAccessMode: (typeof PRODUCT_ACCESS_MODES)[number];

  @Prop({ type: [String], default: [] })
  productIds: string[];

  @Prop({ type: String, enum: INVITATION_STATUSES, required: true, default: 'pending' })
  status: (typeof INVITATION_STATUSES)[number];

  @Prop({ required: true, unique: true })
  tokenHash: string;

  @Prop({ type: Types.ObjectId, required: true })
  invitedByUserId: Types.ObjectId;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Types.ObjectId })
  acceptedByUserId?: Types.ObjectId;

  @Prop()
  acceptedAt?: Date;

  @Prop()
  revokedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}
export const OrganizationInvitationSchema = SchemaFactory.createForClass(OrganizationInvitation);
OrganizationInvitationSchema.index({ organizationId: 1, status: 1 });
OrganizationInvitationSchema.index({ organizationId: 1, emailNormalized: 1, status: 1 });
OrganizationInvitationSchema.index({ expiresAt: 1 });

@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class TeamAuditEvent {
  @Prop({ type: Types.ObjectId, required: true })
  organizationId: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  productId?: Types.ObjectId;

  @Prop({ required: true })
  eventType: string;

  @Prop({ type: Types.ObjectId, required: true })
  actorUserId: Types.ObjectId;

  @Prop()
  targetType?: string;

  @Prop()
  targetId?: string;

  @Prop({ type: Object, default: {} })
  metadata: Record<string, unknown>;

  createdAt?: Date;
}
export const TeamAuditEventSchema = SchemaFactory.createForClass(TeamAuditEvent);
TeamAuditEventSchema.index({ organizationId: 1, createdAt: -1 });
TeamAuditEventSchema.index({ organizationId: 1, eventType: 1, createdAt: -1 });
