import { SocialProviderError } from '../errors/social.errors';

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
    });
  } catch {
    throw new SocialProviderError('social_timeout', 'The social provider request timed out.');
  }
  return parseJsonResponse(response, 'social_provider_request_failed');
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
