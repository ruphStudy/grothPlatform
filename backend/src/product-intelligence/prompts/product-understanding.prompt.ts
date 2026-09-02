export type WebsiteEvidenceStatus = 'available' | 'limited' | 'unavailable';

export interface WebsiteEvidence {
  status: WebsiteEvidenceStatus;
  reason?: string;
  finalUrl?: string;
  title?: string;
  metaDescription?: string;
  headings?: { h1: string[]; h2: string[]; h3: string[] };
  paragraphs?: string[];
  listItems?: string[];
  ctas?: string[];
  textContent?: string;
}

export interface ProductPromptInput {
  name: string;
  websiteUrl?: string;
  shortDescription?: string;
  productType?: string;
  primaryGoal?: string;
  targetMarkets?: string[];
  website?: WebsiteEvidence;
}

const MAX_H1 = 10;
const MAX_H2 = 20;
const MAX_H3 = 20;
const MAX_PARAGRAPHS = 30;
const MAX_LIST_ITEMS = 30;
const MAX_CTAS = 20;
const MAX_TEXT_CONTENT_CHARS = 6000;

const SYSTEM_PROMPT = `You are a senior product marketing analyst producing structured product intelligence.

Evidence reliability order (most to least reliable):
1. User-provided product information — treat as ground truth.
2. Website-extracted factual content — use to confirm or enrich incomplete user-provided information.
3. Reasonable marketing inference — only when neither of the above answers a field; always distinguish inference from stated fact.

Rules:
- Never contradict explicit user-provided information based only on website content or inference.
- Website content may enrich incomplete user data, but is not more authoritative than user-provided data.
- Do not invent product features, capabilities, or claims that neither user-provided data nor website content supports.
- Clearly distinguish confirmed factual capability from marketing inference in your output.
- Place any uncertain or unknown information into the missingInformation field instead of guessing as fact.
- Produce useful, professional marketing intelligence.
- Respond with a single JSON object only, matching the requested schema exactly.
- Do not include markdown, code fences, or any explanatory text outside the JSON object.`;

function formatList(label: string, items: string[] | undefined, max: number): string {
  if (!items || items.length === 0) return `${label}: none`;
  return `${label}: ${items.slice(0, max).join(' | ')}`;
}

function buildWebsiteSection(website?: WebsiteEvidence): string {
  if (!website || website.status === 'unavailable') {
    const reason = website?.reason ? ` (${website.reason})` : '';
    return `WEBSITE-EXTRACTED DATA
----------------------
Website status: unavailable${reason}
No usable website content is available. Rely on user-provided product information only.`;
  }

  const lines = [
    'WEBSITE-EXTRACTED DATA',
    '----------------------',
    `Website status: ${website.status}`,
    website.status === 'limited'
      ? 'Note: website content is limited. Treat it as weak supporting evidence only, not a primary source.'
      : '',
    `Final URL: ${website.finalUrl ?? 'unknown'}`,
    `Title: ${website.title ?? 'none'}`,
    `Meta Description: ${website.metaDescription ?? 'none'}`,
    formatList('H1', website.headings?.h1, MAX_H1),
    formatList('H2', website.headings?.h2, MAX_H2),
    formatList('H3', website.headings?.h3, MAX_H3),
    formatList('Paragraphs', website.paragraphs, MAX_PARAGRAPHS),
    formatList('Useful Lists', website.listItems, MAX_LIST_ITEMS),
    formatList('CTAs', website.ctas, MAX_CTAS),
    `Readable Website Content: ${(website.textContent ?? '').slice(0, MAX_TEXT_CONTENT_CHARS) || 'none'}`,
  ].filter(Boolean);

  return lines.join('\n');
}

export function buildProductUnderstandingPrompt(product: ProductPromptInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  const userProvidedSection = `USER-PROVIDED PRODUCT DATA
--------------------------
Name: ${product.name}
Description: ${product.shortDescription ?? 'not provided'}
Product Type: ${product.productType ?? 'not provided'}
Primary Goal: ${product.primaryGoal ?? 'not provided'}
Target Markets: ${product.targetMarkets?.length ? product.targetMarkets.join(', ') : 'not provided'}
Configured Website URL: ${product.websiteUrl ?? 'not provided'}`;

  const websiteSection = buildWebsiteSection(product.website);

  const userPrompt = `Analyze the product described below using the evidence provided and return a JSON object with exactly these fields:
- summary (string)
- category (string)
- businessModel (one of: b2b, b2c, b2b2c, marketplace, unknown)
- valueProposition (string)
- coreFeatures (string array)
- problemsSolved (string array)
- targetAudiences (array of objects: { name, description, painPoints (string array), goals (string array) })
- likelyUseCases (string array)
- differentiators (string array)
- suggestedPositioning (string)
- marketingAngles (string array)
- missingInformation (string array)
- confidenceScore (number from 0 to 100)

${userProvidedSection}

${websiteSection}`;

  return { systemPrompt: SYSTEM_PROMPT, userPrompt };
}
