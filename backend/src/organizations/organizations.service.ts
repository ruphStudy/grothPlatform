import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { Organization, OrganizationDocument } from './schemas/organization.schema';

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
    return this.toSafeOrganization(org);
  }

  async findAllByOwner(ownerUserId: string) {
    const orgs = await this.orgModel.find({ ownerUserId: new Types.ObjectId(ownerUserId) }).exec();
    return orgs.map((org) => this.toSafeOrganization(org));
  }

  private async findOwnedOrThrow(id: string, ownerUserId: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Organization not found');
    }
    const org = await this.orgModel.findOne({ _id: id, ownerUserId: new Types.ObjectId(ownerUserId) }).exec();
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
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
}
