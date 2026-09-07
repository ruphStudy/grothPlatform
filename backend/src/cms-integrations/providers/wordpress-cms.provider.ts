import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebsiteUrlSecurityService } from '../../website-intelligence/website-url-security.service';
import { CmsProviderError } from '../errors/cms.errors';
import type { CmsConnectionValidationResult, CmsCredential, CmsPlatform, CmsProviderCapabilities, CmsSiteInfo, GetCmsSiteInfoInput, ValidateCmsConnectionInput } from '../types/cms.types';
import type { CmsProvider } from './cms-provider.interface';
import { fetchWordPressJson } from './wordpress-http.util';

// The subset of WordPress's `capabilities` map (from `/wp/v2/users/me`)
// relevant to future blog publishing — normalized, provider-neutral
// labels stored on the connection (item 20). Never invented: only a key
// this endpoint genuinely returned as `true` is ever included.
const RELEVANT_CAPABILITY_KEYS = ['edit_posts', 'publish_posts', 'edit_others_posts', 'upload_files', 'manage_categories'];

/**
 * 20B: WordPress via its REST API + Application Password auth. No shared
 * app credentials exist for this provider — each connection supplies its
 * own site URL + username + application password directly (no OAuth
 * flow), so isConfigured() is unconditionally true. Publishing
 * capabilities (createDraft/publishPost/updatePost/uploadMedia/
 * manageCategories/manageTags) are deliberately all false — no article
 * publishing exists yet (item 3/28).
 */
@Injectable()
export class WordPressCmsProvider implements CmsProvider {
  readonly platform: CmsPlatform = 'wordpress';
  readonly name = 'wordpress';

  constructor(
    private readonly configService: ConfigService,
    private readonly urlSecurity: WebsiteUrlSecurityService,
  ) {}

  isConfigured(): boolean {
    return true;
  }

  getCapabilities(): CmsProviderCapabilities {
    return {
      connectSite: true,
      validateConnection: true,
      fetchSiteInfo: true,
      createDraft: false,
      publishPost: false,
      updatePost: false,
      uploadMedia: false,
      manageCategories: false,
      manageTags: false,
    };
  }

  // Item 18: two calls, both genuinely necessary — the site index (site
  // name/URL/REST API presence) and the authenticated user's own record
  // (credential acceptance + capabilities) return different information
  // neither call can substitute for the other, and inventing either one
  // is explicitly disallowed (item 19).
  async validateConnection(input: ValidateCmsConnectionInput): Promise<CmsConnectionValidationResult> {
    const siteInfo = await this.fetchSiteInfoInternal(input.siteUrl);
    const capabilities = await this.fetchUserCapabilities(input.siteUrl, input.credential);
    return { siteInfo, capabilities };
  }

  async getSiteInfo(input: GetCmsSiteInfoInput): Promise<CmsSiteInfo> {
    return this.fetchSiteInfoInternal(input.siteUrl);
  }

  private async fetchSiteInfoInternal(siteUrl: string): Promise<CmsSiteInfo> {
    const { body } = await fetchWordPressJson(this.urlSecurity, this.configService, siteUrl, '/wp-json/');
    const namespaces = Array.isArray(body.namespaces) ? (body.namespaces as unknown[]) : [];
    if (!namespaces.includes('wp/v2')) {
      throw new CmsProviderError('cms_invalid_site', 'The WordPress REST API (wp/v2) is not available at this site.');
    }
    const siteName = typeof body.name === 'string' && body.name.length > 0 ? body.name : undefined;
    const home = typeof body.home === 'string' && body.home.length > 0 ? body.home : typeof body.url === 'string' ? body.url : siteUrl;
    return { siteUrl: home, siteName, adminUrl: `${home.replace(/\/$/, '')}/wp-admin` };
  }

  private async fetchUserCapabilities(siteUrl: string, credential: CmsCredential): Promise<string[]> {
    if (!credential.username) {
      throw new CmsProviderError('cms_auth_failed', 'A WordPress username is required.');
    }
    const { body } = await fetchWordPressJson(this.urlSecurity, this.configService, siteUrl, '/wp-json/wp/v2/users/me?context=edit', {
      username: credential.username,
      applicationPassword: credential.secret,
    });
    const capabilitiesMap = (typeof body.capabilities === 'object' && body.capabilities !== null ? body.capabilities : {}) as Record<string, boolean>;
    return RELEVANT_CAPABILITY_KEYS.filter((key) => capabilitiesMap[key] === true);
  }
}
