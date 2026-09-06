import type { SocialConnectionStatus } from '../schemas/social-connection.schema';
import type { SocialPlatform } from '../../types/social.types';

// Never includes an encrypted or decrypted token field — this is the only
// shape a controller is ever allowed to return (item 24).
export interface SocialConnectionResponse {
  id: string;
  platform: SocialPlatform;
  accountName?: string;
  username?: string;
  avatarUrl?: string;
  profileUrl?: string;
  status: SocialConnectionStatus;
  scopes?: string[];
  tokenExpiresAt?: Date;
  lastValidatedAt?: Date;
  lastErrorCode?: string;
  createdAt: Date;
  updatedAt: Date;
}
