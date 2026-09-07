import type { CmsConnectionStatus } from '../schemas/cms-connection.schema';
import type { CmsPlatform } from '../../types/cms.types';

export interface ConnectWordPressInput {
  siteUrl: string;
  username: string;
  applicationPassword: string;
}

export interface UpdateCmsConnectionInput {
  username?: string;
  applicationPassword?: string;
}

// Never includes an encrypted or decrypted credential field — this is
// the only shape a controller is ever allowed to return (item 23).
export interface CmsConnectionResponse {
  id: string;
  platform: CmsPlatform;
  siteUrl: string;
  siteName?: string;
  username?: string;
  status: CmsConnectionStatus;
  capabilities?: string[];
  lastValidatedAt?: Date;
  lastErrorCode?: string;
  createdAt: Date;
  updatedAt: Date;
}
