import { ConfigService } from '@nestjs/config';
import { SocialProviderError } from '../errors/social.errors';
import type { BuildAuthorizationUrlInput, BuildAuthorizationUrlResult, ExchangeAuthorizationCodeInput } from '../types/social.types';
import { getJson, postForm } from './social-oauth-http.util';

const DEFAULT_GRAPH_API_VERSION = 'v18.0';
const DEFAULT_MAX_DISCOVERY_PAGES = 3;

// Shared by FacebookSocialProvider and InstagramSocialProvider (item 20) —
// both are Meta Graph API applications using the same client credentials,
// the same authorization/token endpoints, and the same paginated Graph
// list shape. Kept intentionally small: auth URL, code exchange, a single
// typed GET helper, and bounded pagination. No LinkedIn/X code touches this.
export function getMetaGraphApiVersion(configService: ConfigService): string {
  return configService.get<string>('META_GRAPH_API_VERSION') ?? DEFAULT_GRAPH_API_VERSION;
}

export function getMaxDiscoveryPages(configService: ConfigService): number {
  const value = configService.get<string>('SOCIAL_META_MAX_DISCOVERY_PAGES');
  const parsed = value ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_DISCOVERY_PAGES;
}

export function buildMetaAuthorizationUrl(configService: ConfigService, input: BuildAuthorizationUrlInput, defaultScopes: string[]): BuildAuthorizationUrlResult {
  const version = getMetaGraphApiVersion(configService);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: configService.get<string>('META_CLIENT_ID') ?? '',
    redirect_uri: configService.get<string>('META_REDIRECT_URI') ?? input.redirectUri,
    state: input.state,
    scope: (input.scopes ?? defaultScopes).join(','),
  });
  return { url: `https://www.facebook.com/${version}/dialog/oauth?${params.toString()}` };
}

interface MetaTokenResponse {
  access_token?: string;
  expires_in?: number;
}

export interface MetaExchangedToken {
  accessToken: string;
  expiresAt?: Date;
}

export async function exchangeMetaAuthorizationCode(configService: ConfigService, input: ExchangeAuthorizationCodeInput): Promise<MetaExchangedToken> {
  const version = getMetaGraphApiVersion(configService);
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: configService.get<string>('META_REDIRECT_URI') ?? input.redirectUri,
    client_id: configService.get<string>('META_CLIENT_ID') ?? '',
    client_secret: configService.get<string>('META_CLIENT_SECRET') ?? '',
  });
  const data = (await getJson(`https://graph.facebook.com/${version}/oauth/access_token?${params.toString()}`)) as MetaTokenResponse;
  if (typeof data.access_token !== 'string' || data.access_token.length === 0) {
    throw new SocialProviderError('social_token_exchange_failed', 'Meta did not return an access token.');
  }
  return { accessToken: data.access_token, expiresAt: typeof data.expires_in === 'number' ? new Date(Date.now() + data.expires_in * 1000) : undefined };
}

// A single typed Graph GET — treats the response as untrusted (item 30);
// each provider still validates the specific fields it needs.
export async function metaGraphGet(configService: ConfigService, path: string, accessToken: string, extraParams?: Record<string, string>): Promise<Record<string, unknown>> {
  const version = getMetaGraphApiVersion(configService);
  const params = new URLSearchParams({ access_token: accessToken, ...extraParams });
  return getJson(`https://graph.facebook.com/${version}${path}?${params.toString()}`);
}

// 19B: a single typed Graph POST (Page posts, IG media container/publish
// calls) — same untrusted-response treatment as metaGraphGet.
export async function metaGraphPost(configService: ConfigService, path: string, accessToken: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const version = getMetaGraphApiVersion(configService);
  return postForm(`https://graph.facebook.com/${version}${path}`, { access_token: accessToken, ...params });
}

interface MetaListResponse {
  data?: unknown[];
  paging?: { next?: string };
}

// Bounded pagination (item 31) — never crawls unlimited pages.
export async function fetchMetaListBounded(configService: ConfigService, path: string, accessToken: string, extraParams?: Record<string, string>): Promise<unknown[]> {
  const maxPages = getMaxDiscoveryPages(configService);
  const results: unknown[] = [];
  let nextUrl: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const data = (nextUrl ? await getJson(nextUrl) : await metaGraphGet(configService, path, accessToken, extraParams)) as MetaListResponse;
    if (Array.isArray(data.data)) results.push(...data.data);
    nextUrl = data.paging?.next;
    if (!nextUrl) break;
  }
  return results;
}
