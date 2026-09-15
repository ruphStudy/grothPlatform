import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { Organization, OrganizationDocument } from './schemas/organization.schema';
import { AuthorizationService } from '../team/services/team.service';
import { PERMISSIONS } from '../team/schemas/team.schema';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name) private orgModel: Model<OrganizationDocument>,
    private readonly authorizationService: AuthorizationService,
  ) {}

  private async ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
    let slug = base;
    let counter = 2;
    while (
      await this.orgModel.exists({
        slug,
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      })
    ) {
      slug = `${base}-${counter}`;
      counter += 1;
    }
    return slug;
  }

  toSafeOrganization(org: OrganizationDocument) {
    return {
      id: org._id,
      name: org.name,
      slug: org.slug,
      ownerUserId: org.ownerUserId,
      status: org.status,
      createdAt: (org as any).createdAt,
      updatedAt: (org as any).updatedAt,
    };
  }

  async create(ownerUserId: string, dto: CreateOrganizationDto) {
    const baseSlug = slugify(dto.name);
    const slug = await this.ensureUniqueSlug(baseSlug);
    const org = await new this.orgModel({
      name: dto.name,
      slug,
      ownerUserId: new Types.ObjectId(ownerUserId),
      status: 'active',
    }).save();
    await this.authorizationService.ensureOwnerMembership(org._id, ownerUserId);
    return this.toSafeOrganization(org);
  }

  async findAllByOwner(ownerUserId: string) {
    const ownerOrgs = await this.orgModel.find({ ownerUserId: new Types.ObjectId(ownerUserId) }).exec();
    for (const org of ownerOrgs) await this.authorizationService.ensureOwnerMembership(org._id, ownerUserId);
    const orgs = await this.orgModel.find({
      $or: [
        { ownerUserId: new Types.ObjectId(ownerUserId) },
        { _id: { $in: await this.memberOrganizationIds(ownerUserId) } },
      ],
    }).exec();
    return orgs.map((org) => this.toSafeOrganization(org));
  }

  private async findOwnedOrThrow(id: string, ownerUserId: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Organization not found');
    }
    const org = await this.orgModel.findOne({ _id: id }).exec();
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    if (org.ownerUserId.toString() === ownerUserId) await this.authorizationService.ensureOwnerMembership(org._id, ownerUserId);
    await this.authorizationService.assertPermission(id, ownerUserId, PERMISSIONS.ORGANIZATION_VIEW).catch(() => {
      throw new ForbiddenException('organization_access_denied');
    });
    return org;
  }

  async findOneOwned(id: string, ownerUserId: string) {
    const org = await this.findOwnedOrThrow(id, ownerUserId);
    return this.toSafeOrganization(org);
  }

  async update(id: string, ownerUserId: string, dto: UpdateOrganizationDto) {
    const org = await this.findOwnedOrThrow(id, ownerUserId);

    if (dto.name && dto.name !== org.name) {
      const baseSlug = slugify(dto.name);
      org.slug = await this.ensureUniqueSlug(baseSlug, String(org._id));
      org.name = dto.name;
    }

    if (dto.status) {
      org.status = dto.status;
    }

    await org.save();
    return this.toSafeOrganization(org);
  }

  private async memberOrganizationIds(userId: string) {
    try {
      const mongoose = this.orgModel.db;
      const members = await mongoose.model('OrganizationMember').find({ userId: new Types.ObjectId(userId), status: 'active' }).select('organizationId').lean().exec();
      return members.map((member: any) => member.organizationId);
    } catch {
      return [];
    }
  }
}
