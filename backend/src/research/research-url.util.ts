/**
 * Derives a normalized source domain from a result URL (or bare domain
 * string), stripping a leading "www." Returns undefined for unparseable
 * input rather than throwing — this is best-effort metadata, not validation.
 */
export function extractSourceDomain(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  try {
    const url = new URL(hasProtocol ? trimmed : `https://${trimmed}`);
    return url.hostname.toLowerCase().replace(/^www\./, '') || undefined;
  } catch {
    return undefined;
  }
}
