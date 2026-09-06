import { IsIn } from 'class-validator';

const REVIEW_STATUSES = ['unreviewed', 'preferred', 'rejected'] as const;

// Creative *selection* only — never approved/approval_required (that is
// Sprint 28's future workflow, and is independent of this).
export class UpdateCreativeAssetReviewDto {
  @IsIn(REVIEW_STATUSES)
  status!: (typeof REVIEW_STATUSES)[number];
}
