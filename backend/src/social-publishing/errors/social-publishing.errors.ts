import { ConflictException } from '@nestjs/common';

export type SocialPublishingErrorCode = 'publication_review_status_unavailable';

// Human Review (16I) has not run/persisted for this ContentVersion —
// publishing must never silently proceed as if it had (item 29). This is
// distinct from an actual `review_required` decision, which is its own
// ConflictException with a plain message.
export class PublicationReviewStatusUnavailableError extends ConflictException {
  readonly code: SocialPublishingErrorCode = 'publication_review_status_unavailable';
  constructor(message: string) {
    super(message);
  }
}
