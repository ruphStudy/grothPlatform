import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebsiteUrlSecurityService } from '../../website-intelligence/website-url-security.service';
import { CmsProviderError } from '../errors/cms.errors';

const DEFAULT_TIMEOUT_MS = 10000;
const SITE_URL_NOT_ALLOWED_MESSAGE = 'This site URL is not allowed.';

function getTimeoutMs(configService: ConfigService): number {
  const raw = configService.get<string>('CMS_HTTP_TIMEOUT_MS');
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

// Normalizes a user-supplied WordPress site URL: enforces http(s), rejects
// any embedded credentials, strips a trailing slash/query/fragment (item
// 15). Never resolves or probes the network itself — the SSRF check
// happens per-request in fetchWordPressJson, immediately before every
// fetch (item 30), which is what actually matters for DNS-rebinding
// safety.
export function normalizeSiteUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadRequestException('This site URL is not valid.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException(SITE_URL_NOT_ALLOWED_MESSAGE);
  }
  if (url.username || url.password) {
    throw new BadRequestException(SITE_URL_NOT_ALLOWED_MESSAGE);
  }
  url.search = '';
  url.hash = '';
  const normalizedPath = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${normalizedPath}`;
}

// Thin, dependency-free WordPress REST client — deliberately not a
// platform SDK. Every call re-validates the destination against
// WebsiteUrlSecurityService (Sprint 7 SSRF protections) and never
// auto-follows a redirect (item 32) — a 3xx response is treated as a
// site-unreachable failure rather than silently chased to wherever it
// points.
export async function fetchWordPressJson(
  urlSecurity: WebsiteUrlSecurityService,
  configService: ConfigService,
  siteUrl: string,
  path: string,
  auth?: { username: string; applicationPassword: string },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const normalizedSiteUrl = normalizeSiteUrl(siteUrl);
  const url = new URL(path, `${normalizedSiteUrl}/`);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException(SITE_URL_NOT_ALLOWED_MESSAGE);
  }
  if (url.username || url.password) {
    throw new BadRequestException(SITE_URL_NOT_ALLOWED_MESSAGE);
  }
  await urlSecurity.validateDestination(url);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (auth) {
    // Application Password Basic auth — never logged (item 17).
    headers.Authorization = `Basic ${Buffer.from(`${auth.username}:${auth.applicationPassword}`).toString('base64')}`;
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(getTimeoutMs(configService)),
    });
  } catch {
    throw new CmsProviderError('cms_timeout', 'The WordPress site did not respond in time.');
  }

  if (response.status >= 300 && response.status < 400) {
    throw new CmsProviderError('cms_site_unreachable', 'The WordPress site redirected unexpectedly; connect using its canonical URL.');
  }
  if (response.status === 401 || response.status === 403) {
    throw new CmsProviderError('cms_auth_failed', 'WordPress rejected the provided credentials.');
  }
  if (response.status === 404) {
    throw new CmsProviderError('cms_invalid_site', 'The WordPress REST API was not found at this site.');
  }
  if (response.status === 429) {
    throw new CmsProviderError('cms_rate_limited', 'The WordPress site is rate-limiting requests.');
  }
  if (!response.ok) {
    throw new CmsProviderError('cms_provider_request_failed', 'The WordPress site returned an unexpected error.');
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new CmsProviderError('cms_invalid_site', 'The WordPress site did not return a valid REST API response.');
  }
  return { status: response.status, body };
}
