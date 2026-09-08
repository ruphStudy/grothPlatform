import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebsiteUrlSecurityService } from '../../website-intelligence/website-url-security.service';
import { CmsProviderError } from '../errors/cms.errors';
import type {
  CmsConnectionValidationResult,
  CmsCredential,
  CmsPlatform,
  CmsPostRequest,
  CmsPostResult,
  CmsProviderCapabilities,
  CmsSiteInfo,
  CmsTaxonomyItem,
  GetCmsSiteInfoInput,
  ValidateCmsConnectionInput,
  CmsMediaUploadRequest,
  CmsMediaUploadResult,
} from '../types/cms.types';
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
      createDraft: true,
      publishPost: true,
      updatePost: false,
      uploadMedia: true,
      manageCategories: false,
      manageTags: false,
      fetchCategories: true,
      fetchTags: true,
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

  async createPost(input: { siteUrl: string; credential: CmsCredential } & CmsPostRequest): Promise<CmsPostResult> {
    this.assertApplicationPassword(input.credential);
    const payload: Record<string, unknown> = {
      title: input.title,
      content: input.content,
      status: input.status,
    };
    if (input.excerpt) payload.excerpt = input.excerpt;
    if (input.slug) payload.slug = input.slug;
    if (input.featuredMediaId) payload.featured_media = Number(input.featuredMediaId);
    if (input.categoryIds && input.categoryIds.length > 0) payload.categories = input.categoryIds;
    if (input.tagIds && input.tagIds.length > 0) payload.tags = input.tagIds;

    const { body } = await fetchWordPressJson(
      this.urlSecurity,
      this.configService,
      input.siteUrl,
      '/wp-json/wp/v2/posts',
      { username: input.credential.username!, applicationPassword: input.credential.secret },
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    );

    const record = this.requireObject(body);
    const id = typeof record.id === 'number' || typeof record.id === 'string' ? String(record.id) : '';
    if (!id) {
      throw new CmsProviderError('cms_provider_request_failed', 'WordPress did not return a post id.');
    }
    const link = typeof record.link === 'string' && this.isSafeReturnedUrl(record.link) ? record.link : undefined;
    const date = typeof record.date_gmt === 'string' ? new Date(`${record.date_gmt.replace(/Z$/, '')}Z`) : undefined;
    return {
      externalPostId: id,
      externalPostUrl: link,
      status: input.status === 'publish' ? 'published' : 'draft',
      publishedAt: input.status === 'publish' && date && !Number.isNaN(date.getTime()) ? date : undefined,
    };
  }

  async uploadMedia(input: { siteUrl: string; credential: CmsCredential } & CmsMediaUploadRequest): Promise<CmsMediaUploadResult> {
    this.assertApplicationPassword(input.credential);
    const { body } = await fetchWordPressJson(
      this.urlSecurity,
      this.configService,
      input.siteUrl,
      '/wp-json/wp/v2/media',
      { username: input.credential.username!, applicationPassword: input.credential.secret },
      {
        method: 'POST',
        headers: {
          'Content-Type': input.mimeType,
          'Content-Disposition': `attachment; filename="${this.safeFilename(input.filename)}"`,
        },
        body: input.bytes as unknown as BodyInit,
      },
    );
    const record = this.requireObject(body);
    const id = typeof record.id === 'number' || typeof record.id === 'string' ? String(record.id) : '';
    if (!id) {
      throw new CmsProviderError('cms_provider_request_failed', 'WordPress did not return a media id.');
    }
    const url = typeof record.source_url === 'string' && this.isSafeReturnedUrl(record.source_url) ? record.source_url : undefined;
    return { externalMediaId: id, url };
  }

  async listCategories(input: { siteUrl: string; credential: CmsCredential; limit?: number }): Promise<CmsTaxonomyItem[]> {
    this.assertApplicationPassword(input.credential);
    return this.listTaxonomy(input, 'categories');
  }

  async listTags(input: { siteUrl: string; credential: CmsCredential; limit?: number }): Promise<CmsTaxonomyItem[]> {
    this.assertApplicationPassword(input.credential);
    return this.listTaxonomy(input, 'tags');
  }

  private async fetchSiteInfoInternal(siteUrl: string): Promise<CmsSiteInfo> {
    const { body } = await fetchWordPressJson(this.urlSecurity, this.configService, siteUrl, '/wp-json/');
    const record = this.requireObject(body);
    const namespaces = Array.isArray(record.namespaces) ? (record.namespaces as unknown[]) : [];
    if (!namespaces.includes('wp/v2')) {
      throw new CmsProviderError('cms_invalid_site', 'The WordPress REST API (wp/v2) is not available at this site.');
    }
    const siteName = typeof record.name === 'string' && record.name.length > 0 ? record.name : undefined;
    const home = typeof record.home === 'string' && record.home.length > 0 ? record.home : typeof record.url === 'string' ? record.url : siteUrl;
    return { siteUrl: home, siteName, adminUrl: `${home.replace(/\/$/, '')}/wp-admin` };
  }

  private async fetchUserCapabilities(siteUrl: string, credential: CmsCredential): Promise<string[]> {
    this.assertApplicationPassword(credential);
    const { body } = await fetchWordPressJson(this.urlSecurity, this.configService, siteUrl, '/wp-json/wp/v2/users/me?context=edit', {
      username: credential.username!,
      applicationPassword: credential.secret,
    });
    const record = this.requireObject(body);
    const capabilitiesMap = (typeof record.capabilities === 'object' && record.capabilities !== null ? record.capabilities : {}) as Record<string, boolean>;
    return RELEVANT_CAPABILITY_KEYS.filter((key) => capabilitiesMap[key] === true);
  }

  private async listTaxonomy(
    input: { siteUrl: string; credential: CmsCredential; limit?: number },
    taxonomy: 'categories' | 'tags',
  ): Promise<CmsTaxonomyItem[]> {
    const perPage = Math.max(1, Math.min(input.limit ?? 100, 100));
    const { body } = await fetchWordPressJson(
      this.urlSecurity,
      this.configService,
      input.siteUrl,
      `/wp-json/wp/v2/${taxonomy}?per_page=${perPage}&page=1&hide_empty=false`,
      { username: input.credential.username!, applicationPassword: input.credential.secret },
    );
    const rawItems = Array.isArray(body) ? body : [];
    return rawItems
      .map((item) => (typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : null))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item) => ({
        externalId: Number(item.id),
        name: typeof item.name === 'string' ? item.name : '',
        slug: typeof item.slug === 'string' ? item.slug : undefined,
        count: typeof item.count === 'number' ? item.count : undefined,
      }))
      .filter((item) => Number.isInteger(item.externalId) && item.externalId > 0 && item.name.length > 0);
  }

  private assertApplicationPassword(credential: CmsCredential): void {
    if (credential.authType !== 'application_password' || !credential.username || !credential.secret) {
      throw new CmsProviderError('cms_auth_failed', 'A WordPress username and application password are required.');
    }
  }

  private requireObject(body: Record<string, unknown> | unknown[]): Record<string, unknown> {
    if (Array.isArray(body)) {
      throw new CmsProviderError('cms_provider_request_failed', 'WordPress returned an unexpected response.');
    }
    return body;
  }

  private safeFilename(filename: string): string {
    const cleaned = filename.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return cleaned || 'image';
  }

  private isSafeReturnedUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
