import type { SocialPlatform } from '../../types/social.types';
import type { SocialConnectionResponse } from './social-connection.types';

// Display fields only — no token/credential field exists on this type,
// so it is structurally impossible for a controller to leak one here.
export interface PendingSelectionCandidateResponse {
  externalAccountId: string;
  accountName?: string;
  username?: string;
  avatarUrl?: string;
  profileUrl?: string;
  accountType?: string;
}

export interface PendingSelectionResponse {
  selectionId: string;
  platform: SocialPlatform;
  candidates: PendingSelectionCandidateResponse[];
  expiresAt: Date;
}

export interface ResolvedAccountSelection {
  finalized?: SocialConnectionResponse;
  pendingSelectionId?: string;
}
