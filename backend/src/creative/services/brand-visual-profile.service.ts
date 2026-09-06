import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BrandVisualProfile, BrandVisualProfileDocument } from '../schemas/brand-visual-profile.schema';
import type { BrandVisualProfileInput, BrandVisualProfileResponse } from '../types/brand-visual-profile.types';

/**
 * 17F: one genuine, explicitly-configured brand visual profile per
 * product. Absent entirely until a user configures it — 17C-17E creative
 * generation must treat "no profile" as neutral/current behavior, never
 * as invented brand data.
 */
@Injectable()
export class BrandVisualProfileService {
  constructor(@InjectModel(BrandVisualProfile.name) private readonly profileModel: Model<BrandVisualProfileDocument>) {}

  async get(organizationId: string, productId: string): Promise<BrandVisualProfileResponse | null> {
    const doc = await this.profileModel.findOne({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) });
    return doc ? this.toResponse(doc) : null;
  }

  async upsert(organizationId: string, productId: string, input: BrandVisualProfileInput): Promise<BrandVisualProfileResponse> {
    const update: Record<string, unknown> = {};
    if (input.colors !== undefined) update.colors = input.colors;
    if (input.visualStyle !== undefined) update.visualStyle = input.visualStyle;
    if (input.avoidStyles !== undefined) update.avoidStyles = input.avoidStyles;
    if (input.preferredSubjects !== undefined) update.preferredSubjects = input.preferredSubjects;
    if (input.avoidSubjects !== undefined) update.avoidSubjects = input.avoidSubjects;
    if (input.logoUsage !== undefined) {
      update.logoUsage = {
        enabled: input.logoUsage.enabled,
        preferredAssetId: input.logoUsage.preferredAssetId ? new Types.ObjectId(input.logoUsage.preferredAssetId) : undefined,
      };
    }

    const doc = await this.profileModel.findOneAndUpdate(
      { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) },
      { $set: update, $setOnInsert: { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) } },
      { upsert: true, new: true },
    );
    return this.toResponse(doc!);
  }

  private toResponse(doc: BrandVisualProfileDocument): BrandVisualProfileResponse {
    return {
      organizationId: doc.organizationId.toString(),
      productId: doc.productId.toString(),
      colors: doc.colors ? { primary: doc.colors.primary, secondary: doc.colors.secondary, accent: doc.colors.accent, background: doc.colors.background } : undefined,
      visualStyle: doc.visualStyle ?? [],
      avoidStyles: doc.avoidStyles ?? [],
      preferredSubjects: doc.preferredSubjects ?? [],
      avoidSubjects: doc.avoidSubjects ?? [],
      logoUsage: doc.logoUsage ? { enabled: doc.logoUsage.enabled, preferredAssetId: doc.logoUsage.preferredAssetId?.toString() } : undefined,
      updatedAt: doc.updatedAt as Date,
    };
  }
}
