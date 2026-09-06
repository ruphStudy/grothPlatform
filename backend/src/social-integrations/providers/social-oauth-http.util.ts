import { SocialProviderError } from '../errors/social.errors';

const DEFAULT_TIMEOUT_MS = 10000;

// Mirrors the WEBSITE_FETCH_TIMEOUT_MS convention used elsewhere in the
// repo (website-intelligence) — a provider request must never hang
// indefinitely (item 28). Read directly from process.env since these are
// plain functions, not injected Nest providers.
export function getTimeoutMs(): number {
  const raw = process.env.SOCIAL_HTTP_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

// Thin, dependency-free HTTP helpers shared by every platform adapter —
// deliberately not a platform SDK. Normalizes network/HTTP failures into a
// SocialProviderError so the engine never has to guess what a bare fetch
// rejection meant; a provider can still throw a more specific code (e.g.
// social_permission_denied on a 401/403) before this fallback applies.
export async function postForm(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(getTimeoutMs()),
    });
  } catch {
    throw new SocialProviderError('social_timeout', 'The social provider request timed out.');
  }
  return parseJsonResponse(response, 'social_token_exchange_failed');
}

export async function getJson(url: string, accessToken?: string): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      signal: AbortSignal.timeout(getTimeoutMs()),
    });
  } catch {
    throw new SocialProviderError('social_timeout', 'The social provider request timed out.');
  }
  return parseJsonResponse(response, 'social_provider_request_failed');
}

// 19B: a JSON POST with a Bearer token — used by LinkedIn's UGC Post API
// and X's tweet-creation API, both of which take a JSON body rather than
// form-encoded fields. Some publish endpoints return the created id only
// in a response header (e.g. LinkedIn's `x-restli-id`), so the header
// reader is exposed alongside the parsed body rather than discarded.
export interface JsonPostResponse {
  status: number;
  body: Record<string, unknown>;
  header(name: string): string | null;
}

export async function postJson(url: string, payload: unknown, headers: Record<string, string>): Promise<JsonPostResponse> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(getTimeoutMs()),
    });
  } catch {
    throw new SocialProviderError('social_timeout', 'The social provider request timed out.');
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new SocialProviderError('social_permission_denied', 'The social provider rejected the request credentials.');
    }
    if (response.status === 429) {
      throw new SocialProviderError('social_rate_limited', 'The social provider is rate-limiting requests.');
    }
    throw new SocialProviderError('social_provider_request_failed', 'The social provider request failed.');
  }
  let body: Record<string, unknown> = {};
  try {
    const text = await response.text();
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new SocialProviderError('social_provider_request_failed', 'The social provider returned an unreadable response.');
  }
  return { status: response.status, body, header: (name: string) => response.headers.get(name) };
}

// 19F: a status-check GET that never throws on a non-2xx business
// response (404/401/403/etc.) — the caller (a provider's getPostStatus)
// needs the actual HTTP status to normalize published/unavailable/deleted
// itself. Still throws for genuine transport-level failures (timeout,
// rate limiting, an unreadable body) — those aren't a status result.
export interface JsonGetStatusResponse {
  status: number;
  body: Record<string, unknown>;
}

export async function getJsonWithStatus(url: string, accessToken?: string): Promise<JsonGetStatusResponse> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      signal: AbortSignal.timeout(getTimeoutMs()),
    });
  } catch {
    throw new SocialProviderError('social_timeout', 'The social provider request timed out.');
  }
  if (response.status === 429) {
    throw new SocialProviderError('social_rate_limited', 'The social provider is rate-limiting requests.');
  }
  let body: Record<string, unknown> = {};
  try {
    const text = await response.text();
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    throw new SocialProviderError('social_provider_request_failed', 'The social provider returned an unreadable response.');
  }
  return { status: response.status, body };
}

async function parseJsonResponse(response: Response, fallbackFailureCode: 'social_token_exchange_failed' | 'social_provider_request_failed'): Promise<Record<string, unknown>> {
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new SocialProviderError('social_permission_denied', 'The social provider rejected the request credentials.');
    }
    if (response.status === 429) {
      throw new SocialProviderError('social_rate_limited', 'The social provider is rate-limiting requests.');
    }
    throw new SocialProviderError(fallbackFailureCode, 'The social provider request failed.');
  }
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    throw new SocialProviderError(fallbackFailureCode, 'The social provider returned an unreadable response.');
  }
}
