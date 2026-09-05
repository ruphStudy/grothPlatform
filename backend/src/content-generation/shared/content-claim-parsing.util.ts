// Shared, pure, deterministic sentence/claim primitives used by both 16A
// (grounding) and 16B (fact validation). No AI, no I/O. Behavior here is
// unchanged from what 16A originally had inline — 16B only adds stricter
// rules on top, it never re-implements sentence splitting or high-risk
// detection from scratch.

export interface HighRiskMatch {
  category: string;
  label: string;
}

export interface MatchResult {
  strength: 'strong' | 'partial' | 'none';
  refs: string[];
}

// Function words / marketing filler excluded from token-overlap matching so
// a single shared generic word (e.g. "platform") can never by itself count
// as evidence support.
export const GENERIC_NOISE_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'of', 'for', 'with', 'and', 'or', 'to', 'in',
  'on', 'at', 'by', 'as', 'that', 'this', 'it', 'its', 'their', 'your', 'our', 'you', 'we', 'they', 'them',
  'platform', 'solution', 'solutions', 'product', 'products', 'service', 'services', 'tool', 'tools', 'app',
  'application', 'best', 'leading', 'top', 'most', 'trusted', 'only', 'great', 'amazing', 'powerful', 'innovative',
  'business', 'businesses', 'company', 'companies', 'users', 'user', 'customers', 'customer', 'client', 'clients',
  'help', 'helps', 'helping', 'use', 'uses', 'using', 'get', 'gets', 'make', 'makes', 'today', 'now', 'more',
]);

export const CTA_START_PATTERN = /^(click|join|sign\s?up|get\s+started|download|try|book|subscribe|share|learn\s+more|discover|explore|start|contact|visit|register|apply|schedule|request)\b/i;

export const OPINION_MARKERS = /\b(we believe|in our opinion|imagine|picture this|isn'?t it|what if|you might think|it'?s no secret)\b/i;

export const GENERIC_ADVICE_PHRASES = /\b(in conclusion|in summary|the bottom line|at the end of the day|preparation is key|practice makes perfect|now more than ever|in today'?s (world|competitive|fast-paced))\b/i;

export const HIGH_RISK_PATTERNS: (HighRiskMatch & { pattern: RegExp })[] = [
  { category: 'customer_count', label: 'Customer/user count', pattern: /\b\d[\d,]*\+?\s*(customers?|users?|candidates?|clients?|companies|businesses)\b/i },
  { category: 'revenue_roi', label: 'Revenue/ROI', pattern: /\b(revenue|roi|return on investment)\b/i },
  { category: 'superlative', label: 'Superlative/ranking', pattern: /(#\s?1|\bnumber\s+one\b|\bbest\b|\bleading\b|\bmost trusted\b|\btop[- ]rated\b|\bunmatched\b|\bunrivaled\b|\bworld[- ]class\b)/i },
  { category: 'guarantee', label: 'Guarantee', pattern: /\b(guarantee[sd]?|100%\s*(guarantee|success))\b/i },
  { category: 'certification', label: 'Certification/compliance', pattern: /\b(certified|certification|compliant|compliance|gdpr|soc\s?2|iso\s?\d+|hipaa)\b/i },
  { category: 'integration', label: 'Named integration', pattern: /\b(integrates?\s+with|integration\s+with|works?\s+with|compatible\s+with|connects?\s+to)\b/i },
  { category: 'pricing', label: 'Pricing', pattern: /([$₹€£]\s?\d)|\bpricing\b|\bper\s?(month|year)\b|\bfree\s?trial\b/i },
  { category: 'testimonial', label: 'Testimonial/case study', pattern: /\b(testimonial|case study|success story|according to)\b/i },
  { category: 'award', label: 'Award', pattern: /\b(award(ed)?|winner|recognized by)\b/i },
  { category: 'competitor', label: 'Competitor comparison', pattern: /\b(better than|outperforms|beats|versus|vs\.?)\s+\w+/i },
  { category: 'numeric_stat', label: 'Numeric statistic', pattern: /\b\d[\d,]*(\.\d+)?%/ },
];

export const CAPABILITY_VERB_PATTERN = /\b(supports?|enables?|helps?|provides?|offers?|automates?|generates?|analyz(e|es)|manages?|creates?|delivers?|includes?|allows?|lets you|features?)\b/i;

export function splitSentences(text: string): string[] {
  return text
    .replace(/\r/g, '')
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);
}

export function isRhetoricalOrOpinion(sentence: string): boolean {
  if (sentence.trim().endsWith('?')) return true;
  if (OPINION_MARKERS.test(sentence)) return true;
  if (GENERIC_ADVICE_PHRASES.test(sentence)) return true;
  return false;
}

export function isCtaOnly(sentence: string): boolean {
  return CTA_START_PATTERN.test(sentence.trim());
}

export function detectHighRisk(sentence: string): HighRiskMatch | null {
  for (const rule of HIGH_RISK_PATTERNS) {
    if (rule.pattern.test(sentence)) return { category: rule.category, label: rule.label };
  }
  return null;
}

export function looksFactual(sentence: string): boolean {
  if (CAPABILITY_VERB_PATTERN.test(sentence)) return true;
  if (/\bis\s+(a|an)\b/i.test(sentence)) return true;
  if (/\d/.test(sentence)) return true;
  return false;
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function significantTokens(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .split(/\s+/)
      .filter((t) => t.length > 2 && !GENERIC_NOISE_WORDS.has(t)),
  );
}

export function matchEvidence(claimText: string, evidenceItems: string[]): MatchResult {
  const claimTokens = significantTokens(claimText);
  if (claimTokens.size === 0 || evidenceItems.length === 0) return { strength: 'none', refs: [] };

  const normalizedClaim = normalizeText(claimText);
  let bestRatio = 0;
  let bestOverlap = 0;
  let bestItem: string | undefined;
  let containmentMatch: string | undefined;

  for (const item of evidenceItems) {
    const normalizedItem = normalizeText(item);
    if (!normalizedItem) continue;

    if (normalizedItem.length > 8 && (normalizedClaim.includes(normalizedItem) || normalizedItem.includes(normalizedClaim))) {
      containmentMatch = item;
      break;
    }

    const itemTokens = significantTokens(item);
    if (itemTokens.size === 0) continue;
    const overlap = [...claimTokens].filter((t) => itemTokens.has(t)).length;
    const ratio = overlap / Math.max(1, Math.min(claimTokens.size, itemTokens.size));
    if (overlap > bestOverlap || (overlap === bestOverlap && ratio > bestRatio)) {
      bestOverlap = overlap;
      bestRatio = ratio;
      bestItem = item;
    }
  }

  if (containmentMatch) return { strength: 'strong', refs: [containmentMatch] };
  if (bestOverlap >= 2 && bestRatio >= 0.6) return { strength: 'strong', refs: bestItem ? [bestItem] : [] };
  if (bestOverlap >= 2 && bestRatio >= 0.3) return { strength: 'partial', refs: bestItem ? [bestItem] : [] };
  return { strength: 'none', refs: [] };
}
