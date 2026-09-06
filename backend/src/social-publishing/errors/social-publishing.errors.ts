import { ConflictException } from '@nestjs/common';

export type SocialPublishingErrorCode = 'publication_review_status_unavailable' | 'publication_human_review_required';

// Human Review (16I) has not run/persisted for this ContentVersion —
// publishing must never silently proceed as if it had (item 29). This is
// distinct from an actual `review_required` decision, which is its own
// typed error below.
export class PublicationReviewStatusUnavailableError extends ConflictException {
  readonly code: SocialPublishingErrorCode = 'publication_review_status_unavailable';
  constructor(message: string) {
    super(message);
  }
}

// Human Review's decision is `review_required` — a typed error (rather
// than a bare ConflictException) so 19D's scheduler worker can reliably
// recognize "review status changed since the schedule was created" and
// record the suggested `publication_human_review_required` code (item 26)
// without any provider call ever happening.
export class HumanReviewRequiredError extends ConflictException {
  readonly code: SocialPublishingErrorCode = 'publication_human_review_required';
  constructor(message: string) {
    super(message);
  }
}
