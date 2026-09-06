// Reuses the existing 15B text-sanitization helpers rather than duplicating
// them — plain functions, no NestJS DI involved, so importing across the
// content-generation/creative module boundary is safe.
import { sanitizeText } from '../../content-generation/prompting/content-prompt-sections.util';

export { sanitizeText };

export const DEFAULT_TEXT_OVERLAY_MAX_CHARS = 80;
const MAX_FIELD_CHARS = 400;

/** Trim + cap a single free-text context field. Returns undefined for blank input. */
export function capField(value: string | undefined, maxChars: number = MAX_FIELD_CHARS): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = sanitizeText(value).slice(0, maxChars);
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Truncate overlay text to a whole-word boundary at or under maxChars.
 * Never cuts mid-word. Returns undefined if nothing usable remains.
 */
export function truncateOverlayText(value: string, maxChars: number): string | undefined {
  const cleaned = sanitizeText(value);
  if (cleaned.length <= maxChars) return cleaned.length > 0 ? cleaned : undefined;
  const slice = cleaned.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(' ');
  const safe = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  const trimmed = safe.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// Deterministic, provider-neutral quality/safety exclusions. No provider-
// specific syntax (weights, tags, etc.) — a concrete provider adapter may
// translate this later if a specific provider needs a different format.
const BASE_NEGATIVE_TERMS = ['distorted hands', 'malformed text', 'watermark', 'fake logos', 'clutter', 'unreadable typography', 'low quality', 'blurry'];
const NO_TEXT_NEGATIVE_TERMS = ['extraneous text', 'gibberish text', 'random letters or numbers'];

export function buildNegativePrompt(overlayEnabled: boolean): string {
  const terms = overlayEnabled ? BASE_NEGATIVE_TERMS : [...BASE_NEGATIVE_TERMS, ...NO_TEXT_NEGATIVE_TERMS];
  return terms.join(', ');
}

/**
 * Join non-empty sections with a blank line, dropping whole optional
 * sections (never substrings within one) from the end of `optionalOrder`
 * until the result fits within maxChars. Required sections are never
 * dropped, so if the requirement is unmet even without any optional
 * section, the required content is still returned as-is.
 */
export function assembleWithBudget(required: string[], optional: Map<string, string>, optionalOrder: string[], maxChars: number): string {
  const remaining = new Map(optional);
  const render = (): string => [...required, ...optionalOrder.filter((k) => remaining.has(k)).map((k) => remaining.get(k) as string)].filter(Boolean).join('\n\n');

  let result = render();
  const dropOrder = [...optionalOrder].reverse();
  for (const key of dropOrder) {
    if (result.length <= maxChars) break;
    if (remaining.has(key)) {
      remaining.delete(key);
      result = render();
    }
  }
  return result;
}
