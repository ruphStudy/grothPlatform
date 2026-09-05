import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { GrowthStrategyReviewService } from '../growth-strategy/growth-strategy-review.service';
import { ProductsService } from '../products/products.service';
import { toCampaignResponse } from './campaigns.mapper';
import { CampaignsService } from './campaigns.service';
import { RequestCampaignReviewChangesDto } from './dto/request-campaign-review-changes.dto';
import { UpdateCampaignReviewDto } from './dto/update-campaign-review.dto';
import { CAMPAIGN_REVIEW_SECTIONS, CampaignReviewRecord } from './schemas/campaign.schema';
import type { CampaignApprovalStatus } from './types/campaign-review.types';
import type { CampaignResponse } from './types/campaign.types';

function defaultReview(): CampaignReviewRecord {
  return {
    status: 'draft',
    sectionReviews: CAMPAIGN_REVIEW_SECTIONS.map((section) => ({ section, status: 'pending' as const })),
  } as CampaignReviewRecord;
}

/**
 * Review/approval metadata only — embedded on Campaign, never a copy of the
 * plan payload. Reuses the same recompute/staleness semantics established
 * by the Growth Strategy review (12I) and the approval/staleness gating
 * already used by 13B/13C/13D, adapted for a 1:1-embedded resource.
 */
@Injectable()
export class CampaignReviewService {
  constructor(
    private readonly productsService: ProductsService,
    private readonly campaignsService: CampaignsService,
    private readonly growthStrategyReviewService: GrowthStrategyReviewService,
  ) {}

  async saveReview(organizationId: string, productId: string, campaignId: string, userId: string, dto: UpdateCampaignReviewDto): Promise<CampaignResponse> {
    await this.productsService.findOne(organizationId, productId, userId);
    const campaign = await this.campaignsService.findCampaignDoc(organizationId, productId, campaignId);

    const review = campaign.review ?? defaultReview();

    if (dto.overallNote !== undefined) review.overallNote = dto.overallNote;

    if (dto.sectionReviews) {
      // Normalize/dedupe: only the last entry per section in the payload
      // applies, and every canonical section always ends up represented.
      const bySection = new Map(dto.sectionReviews.map((s) => [s.section, s]));
      for (const section of CAMPAIGN_REVIEW_SECTIONS) {
        const update = bySection.get(section);
        if (!update) continue;
        const existing = review.sectionReviews.find((s) => s.section === section);
        if (existing) {
          existing.status = update.status;
          existing.note = update.note;
          existing.reviewedAt = new Date();
        } else {
          review.sectionReviews.push({ section, status: update.status, note: update.note, reviewedAt: new Date() });
        }
      }
      // Self-heal: guarantee every canonical section is represented even if
      // it was never explicitly touched.
      for (const section of CAMPAIGN_REVIEW_SECTIONS) {
        if (!review.sectionReviews.some((s) => s.section === section)) {
          review.sectionReviews.push({ section, status: 'pending' });
        }
      }
    }

    this.recomputeOverallStatus(review);
    campaign.review = review;
    campaign.updatedBy = new Types.ObjectId(userId);
    await campaign.save();
    return toCampaignResponse(campaign);
  }

  async approve(organizationId: string, productId: string, campaignId: string, userId: string): Promise<CampaignResponse> {
    const product = await this.productsService.findOne(organizationId, productId, userId);
    const campaign = await this.campaignsService.findCampaignDoc(organizationId, productId, campaignId);

    const hasMapping = !!campaign.audienceChannelMapping && (campaign.audienceChannelMapping.audiences.length > 0 || campaign.audienceChannelMapping.channels.length > 0);
    const missing: string[] = [];
    if (!campaign.goal) missing.push('a campaign goal');
    if (!hasMapping) missing.push('an audience/channel mapping');
    if (!campaign.plan) missing.push('a generated 30-day plan');
    if (missing.length > 0) {
      throw new BadRequestException(`Complete ${missing.join(', ')} before approval.`);
    }

    const review = campaign.review ?? defaultReview();
    if (review.sectionReviews.some((s) => s.status === 'changes_requested')) {
      throw new BadRequestException('Resolve requested changes before approving this campaign.');
    }

    // Cheap pre-check first — avoids the expensive strategy rebuild entirely
    // (there isn't one here at all: approval never rebuilds Growth Strategy,
    // it only checks the existing review record). Same current-version
    // semantics as 13B/13C/13D: staleness is judged against the product's
    // own updatedAt, never a freshly rebuilt "now" timestamp.
    const strategyReview = await this.growthStrategyReviewService.getReview(organizationId, productId, userId);
    if (strategyReview.status !== 'approved') {
      throw new ConflictException('Approve the current Growth Strategy before approving this campaign.');
    }
    const productUpdatedAt: Date = (product as { updatedAt?: Date }).updatedAt ?? new Date(0);
    const strategyStillApproved = await this.growthStrategyReviewService.isStrategyApprovedForCurrentVersion(organizationId, productId, userId, productUpdatedAt);
    if (!strategyStillApproved) {
      throw new ConflictException('The product has changed since the Growth Strategy was last approved. Review and approve it again before approving this campaign.');
    }

    review.status = 'approved';
    review.approvedAt = new Date();
    review.changesRequestedAt = undefined;
    review.reviewedPlanningVersion = campaign.planningMetadata.version;
    review.reviewedPlanGeneratedAt = campaign.plan!.generatedAt;
    campaign.review = review;
    campaign.status = 'approved';
    campaign.updatedBy = new Types.ObjectId(userId);
    await campaign.save();
    return toCampaignResponse(campaign);
  }

  async requestChanges(organizationId: string, productId: string, campaignId: string, userId: string, dto: RequestCampaignReviewChangesDto): Promise<CampaignResponse> {
    await this.productsService.findOne(organizationId, productId, userId);
    const campaign = await this.campaignsService.findCampaignDoc(organizationId, productId, campaignId);

    const review = campaign.review ?? defaultReview();
    review.status = 'changes_requested';
    review.changesRequestedAt = new Date();
    review.approvedAt = undefined;
    if (dto.note !== undefined) review.overallNote = dto.note;
    campaign.review = review;

    if (campaign.status === 'approved') campaign.status = 'planned';
    campaign.updatedBy = new Types.ObjectId(userId);
    await campaign.save();
    return toCampaignResponse(campaign);
  }

  /**
   * Cheap, single-read helper reserved for future publishing gates
   * (Sprint 19+) — not wired into any gate in this sprint.
   */
  async isCampaignApprovedForCurrentVersion(organizationId: string, productId: string, campaignId: string, userId: string): Promise<CampaignApprovalStatus> {
    await this.productsService.findOne(organizationId, productId, userId);
    const campaign = await this.campaignsService.findCampaignDoc(organizationId, productId, campaignId);

    const review = campaign.review;
    if (!review || review.status !== 'approved') {
      return { approved: false, stale: false, reason: 'Campaign has not been approved.' };
    }

    const versionStale = campaign.planningMetadata.version > (review.reviewedPlanningVersion ?? 0);
    const planStale = !!campaign.plan && !!review.reviewedPlanGeneratedAt && campaign.plan.generatedAt.getTime() > review.reviewedPlanGeneratedAt.getTime();
    const stale = versionStale || planStale;
    return { approved: !stale, stale, reason: stale ? 'The campaign has changed since it was last approved.' : undefined };
  }

  // ---------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------

  private recomputeOverallStatus(review: CampaignReviewRecord): void {
    const hasChangesRequested = review.sectionReviews.some((s) => s.status === 'changes_requested');
    if (hasChangesRequested) {
      if (review.status !== 'changes_requested') review.changesRequestedAt = new Date();
      review.status = 'changes_requested';
      review.approvedAt = undefined;
      return;
    }

    // Approval is only ever set by the explicit approve action — if a
    // previously-approved section moves back to pending, the overall
    // approval no longer reflects the current review state.
    if (review.status === 'approved') {
      const hasPending = review.sectionReviews.some((s) => s.status === 'pending');
      if (hasPending) {
        review.status = 'draft';
        review.approvedAt = undefined;
      }
      return;
    }

    // The blocking condition that produced 'changes_requested' is resolved —
    // return to 'draft' rather than silently becoming 'approved', since
    // overall approval must remain an explicit action.
    if (review.status === 'changes_requested') {
      review.status = 'draft';
      review.changesRequestedAt = undefined;
    }
  }
}
