import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Organization, OrganizationSchema } from '../organizations/schemas/organization.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { InvitationPublicController, TeamController } from './team.controller';
import { OrganizationInvitation, OrganizationInvitationSchema, OrganizationMember, OrganizationMemberSchema, OrganizationRole, OrganizationRoleSchema, ProductAccessGrant, ProductAccessGrantSchema, TeamAuditEvent, TeamAuditEventSchema } from './schemas/team.schema';
import { AuthorizationService, InvitationService, OrganizationMemberService, RoleService } from './services/team.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: OrganizationMember.name, schema: OrganizationMemberSchema },
      { name: OrganizationInvitation.name, schema: OrganizationInvitationSchema },
      { name: OrganizationRole.name, schema: OrganizationRoleSchema },
      { name: ProductAccessGrant.name, schema: ProductAccessGrantSchema },
      { name: TeamAuditEvent.name, schema: TeamAuditEventSchema },
      { name: Organization.name, schema: OrganizationSchema },
      { name: Product.name, schema: ProductSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [TeamController, InvitationPublicController],
  providers: [AuthorizationService, OrganizationMemberService, InvitationService, RoleService],
  exports: [AuthorizationService, OrganizationMemberService, InvitationService, RoleService, MongooseModule],
})
export class TeamModule {}
