import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProductsService } from '../products/products.service';
import { UpdateGrowthStrategyReviewDto } from './dto/update-growth-strategy-review.dto';
import { GrowthStrategyReview, GrowthStrategyReviewDocument } from './schemas/growth-strategy-review.schema';
import type { GrowthStrategyReviewResponse, GrowthStrategySectionReviewResponse } from './types/growth-strategy-review.types';

/**
 * Review/approval metadata only — never persists the generated strategy
 * payload itself, which stays derived from existing intelligence and is
 * rebuilt on demand via the existing overview/plan-preview endpoints.
 */
@Injectable()
export class GrowthStrategyReviewService {
  constructor(
    @InjectModel(GrowthStrategyReview.name) private readonly reviewModel: Model<GrowthStrategyReviewDocument>,
    private readonly productsService: ProductsService,
  ) {}

  async getReview(organizationId: string, productId: string, userId: string): Promise<GrowthStrategyReviewResponse> {
    await this.productsService.findOne(organizationId, productId, userId);
    const doc = await this.findDoc(organizationId, productId);
    return doc ? this.toResponse(doc) : this.defaultResponse(organizationId, productId);
  }

  async saveReview(
    organizationId: string,
    productId: string,
    userId: string,
    dto: UpdateGrowthStrategyReviewDto,
  ): Promise<GrowthStrategyReviewResponse> {
    await this.productsService.findOne(organizationId, productId, userId);
    const doc = await this.findOrCreateDoc(organizationId, productId);

    if (dto.overallNote !== undefined) doc.overallNote = dto.overallNote;

    if (dto.sectionReviews) {
      for (const sr of dto.sectionReviews) {
        const existing = doc.sectionReviews.find((s) => s.section === sr.section);
        if (existing) {
          existing.status = sr.status;
          existing.note = sr.note;
          existing.reviewedAt = new Date();
        } else {
          doc.sectionReviews.push({ section: sr.section, status: sr.status, note: sr.note, reviewedAt: new Date() });
        }
      }
    }

    this.recomputeOverallStatus(doc);
    await doc.save();
    return this.toResponse(doc);
  }

  async approve(organizationId: string, productId: string, userId: string, strategyGeneratedAt?: string): Promise<GrowthStrategyReviewResponse> {
    await this.productsService.findOne(organizationId, productId, userId);
    const doc = await this.findOrCreateDoc(organizationId, productId);

    const hasUnresolvedChanges = doc.sectionReviews.some((s) => s.status === 'changes_requested');
    if (hasUnresolvedChanges) {
      throw new BadRequestException('Cannot approve the strategy while one or more sections still have requested changes.');
    }

    doc.status = 'approved';
    doc.approvedAt = new Date();
    doc.changesRequestedAt = undefined;
    doc.reviewedStrategyGeneratedAt = strategyGeneratedAt ? new Date(strategyGeneratedAt) : new Date();
    await doc.save();
    return this.toResponse(doc);
  }

  async requestChanges(organizationId: string, productId: string, userId: string, note?: string): Promise<GrowthStrategyReviewResponse> {
    await this.productsService.findOne(organizationId, productId, userId);
    const doc = await this.findOrCreateDoc(organizationId, productId);

    doc.status = 'changes_requested';
    doc.changesRequestedAt = new Date();
    doc.approvedAt = undefined;
    if (note !== undefined) doc.overallNote = note;
    await doc.save();
    return this.toResponse(doc);
  }

  /**
   * Cheap, single-read helper for Sprint 13 to later enforce approval
   * gating — no strategy rebuild involved. Not wired into any gate yet.
   */
  async isStrategyApprovedForCurrentVersion(organizationId: string, productId: string, userId: string, currentGeneratedAt: Date): Promise<boolean> {
    await this.productsService.findOne(organizationId, productId, userId);
    const doc = await this.findDoc(organizationId, productId);
    if (!doc || doc.status !== 'approved' || !doc.reviewedStrategyGeneratedAt) return false;
    return doc.reviewedStrategyGeneratedAt.getTime() >= currentGeneratedAt.getTime();
  }

  // ---------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------

  private recomputeOverallStatus(doc: GrowthStrategyReviewDocument): void {
    const hasChangesRequested = doc.sectionReviews.some((s) => s.status === 'changes_requested');
    if (hasChangesRequested) {
      if (doc.status !== 'changes_requested') doc.changesRequestedAt = new Date();
      doc.status = 'changes_requested';
      doc.approvedAt = undefined;
      return;
    }

    // Approval is only ever set by the explicit approve action — if a
    // previously-approved section moves back to pending, the overall
    // approval no longer reflects the current review state.
    if (doc.status === 'approved') {
      const hasPending = doc.sectionReviews.some((s) => s.status === 'pending');
      if (hasPending) {
        doc.status = 'draft';
        doc.approvedAt = undefined;
      }
      return;
    }

    // The blocking condition that produced 'changes_requested' is resolved —
    // return to 'draft' rather than silently becoming 'approved', since
    // overall approval must remain an explicit action.
    if (doc.status === 'changes_requested') {
      doc.status = 'draft';
      doc.changesRequestedAt = undefined;
    }
  }

  private async findDoc(organizationId: string, productId: string): Promise<GrowthStrategyReviewDocument | null> {
    return this.reviewModel
      .findOne({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) })
      .exec();
  }

  private async findOrCreateDoc(organizationId: string, productId: string): Promise<GrowthStrategyReviewDocument> {
    const existing = await this.findDoc(organizationId, productId);
    if (existing) return existing;
    return new this.reviewModel({
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      status: 'draft',
      sectionReviews: [],
    });
  }

  private defaultResponse(organizationId: string, productId: string): GrowthStrategyReviewResponse {
    return {
      organizationId,
      productId,
      status: 'draft',
      sectionReviews: [],
    };
  }

  private toResponse(doc: GrowthStrategyReviewDocument): GrowthStrategyReviewResponse {
    const sectionReviews: GrowthStrategySectionReviewResponse[] = doc.sectionReviews.map((s) => ({
      section: s.section,
      status: s.status,
      note: s.note,
      reviewedAt: s.reviewedAt,
    }));

    return {
      id: doc._id.toString(),
      organizationId: doc.organizationId.toString(),
      productId: doc.productId.toString(),
      status: doc.status,
      sectionReviews,
      overallNote: doc.overallNote,
      approvedAt: doc.approvedAt,
      changesRequestedAt: doc.changesRequestedAt,
      reviewedStrategyGeneratedAt: doc.reviewedStrategyGeneratedAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
