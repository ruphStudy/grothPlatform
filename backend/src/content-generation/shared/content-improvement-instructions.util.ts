import type { ContentBrandVoiceResultResponse } from '../types/content-brand-voice.types';
import type { ContentFactValidationResultResponse } from '../types/content-fact-validation.types';
import type { ContentGroundingResultResponse } from '../types/content-grounding.types';
import type { ContentImprovementFocus } from '../types/content-improvement.types';
import type { ContentOriginalityResultResponse } from '../types/content-originality.types';
import type { ContentQualityResultResponse } from '../types/content-quality.types';
import type { ContentReadabilityResultResponse } from '../types/content-readability.types';
import type { ContentSeoReviewResultResponse } from '../types/content-seo-review.types';

const MAX_LIST_ITEMS = 8;

// Critical, non-negotiable regardless of focus (spec sections 12/15).
export const FACTUAL_BOUNDARY_INSTRUCTION = 'Do not introduce any new factual claim that is not supported by the supplied evidence snapshot.';

export interface ImprovementReviewInputs {
  focus: ContentImprovementFocus;
  grounding: ContentGroundingResultResponse | null;
  factValidation: ContentFactValidationResultResponse | null;
  seo: ContentSeoReviewResultResponse | null;
  readability: ContentReadabilityResultResponse | null;
  brandVoice: ContentBrandVoiceResultResponse | null;
  originality: ContentOriginalityResultResponse | null;
  quality: ContentQualityResultResponse | null;
}

// Deterministic mapping from persisted 16A-16G findings to explicit
// improvement instructions (spec section 10-12). Never asks the model to
// "make it better" — every instruction traces back to a specific finding.
// Grounding/Fact Validation safety instructions always apply; the other
// dimensions are gated by `focus`.
export function buildImprovementInstructions(input: ImprovementReviewInputs): string[] {
  const { focus, grounding, factValidation, seo, readability, brandVoice, originality, quality } = input;
  const instructions: string[] = [FACTUAL_BOUNDARY_INSTRUCTION];

  if (grounding) {
    const unsupported = grounding.claims.filter((c) => c.classification === 'unsupported').map((c) => c.text).slice(0, MAX_LIST_ITEMS);
    const uncertain = grounding.claims.filter((c) => c.classification === 'uncertain').map((c) => c.text).slice(0, MAX_LIST_ITEMS);
    if (unsupported.length > 0) instructions.push(`Remove or replace these unsupported claims with only supported wording: ${quoteList(unsupported)}.`);
    if (uncertain.length > 0) instructions.push(`Soften or rephrase these uncertain claims so they no longer read as settled fact: ${quoteList(uncertain)}.`);
  }

  if (factValidation) {
    const invalid = factValidation.claims.filter((c) => c.classification === 'invalid').map((c) => c.text).slice(0, MAX_LIST_ITEMS);
    const needsReview = factValidation.claims.filter((c) => c.classification === 'needs_review').map((c) => c.text).slice(0, MAX_LIST_ITEMS);
    if (invalid.length > 0) instructions.push(`Remove or correct these invalid claims using only the supplied evidence: ${quoteList(invalid)}.`);
    if (needsReview.length > 0) instructions.push(`Phrase these claims more cautiously since they need review: ${quoteList(needsReview)}.`);
  }

  const includeSeo = focus === 'all' || focus === 'seo';
  const includeReadability = focus === 'all' || focus === 'readability';
  const includeBrandVoice = focus === 'all' || focus === 'brand_voice';
  const includeOriginality = focus === 'all' || focus === 'originality';

  if (includeSeo && seo) {
    const issues = seo.checks.filter((c) => c.classification === 'warning' || c.classification === 'failed').map((c) => c.reason).slice(0, MAX_LIST_ITEMS);
    if (issues.length > 0) instructions.push(`Fix these SEO issues using natural keyword use, clear headings, and topic alignment — do not invent keywords, metrics, or search-volume claims: ${quoteList(issues)}.`);
  }

  if (includeReadability && readability) {
    const issues = readability.checks.filter((c) => c.classification === 'warning' || c.classification === 'failed').map((c) => c.reason).slice(0, MAX_LIST_ITEMS);
    if (issues.length > 0) instructions.push(`Improve readability by addressing: ${quoteList(issues)}.`);
  }

  if (includeBrandVoice && brandVoice) {
    const issues = brandVoice.checks.filter((c) => c.classification === 'warning' || c.classification === 'failed').map((c) => c.reason).slice(0, MAX_LIST_ITEMS);
    if (issues.length > 0) instructions.push(`Align the brand voice by addressing: ${quoteList(issues)}.`);
  }

  if (includeOriginality && originality) {
    const issues = originality.checks.filter((c) => c.classification === 'warning' || c.classification === 'failed').map((c) => c.reason).slice(0, MAX_LIST_ITEMS);
    if (issues.length > 0) instructions.push(`Rewrite repetitive or near-duplicate wording while preserving the underlying message: ${quoteList(issues)}.`);
  }

  // Quality blockers/weaknesses only prioritize the general "all" focus —
  // a narrower focus should not pull in unrelated dimensions.
  if (focus === 'all' && quality) {
    const priorities = [...quality.blockers.map((b) => b.reason), ...quality.weaknesses].slice(0, MAX_LIST_ITEMS);
    if (priorities.length > 0) instructions.push(`Prioritize these overall quality issues first: ${quoteList(priorities)}.`);
  }

  return instructions;
}

function quoteList(items: string[]): string {
  return items.map((i) => `"${i}"`).join('; ');
}
