export interface ProductPromptInput {
  name: string;
  websiteUrl?: string;
  shortDescription?: string;
  productType?: string;
  primaryGoal?: string;
  targetMarkets?: string[];
}

const SYSTEM_PROMPT = `You are a senior product marketing analyst producing structured product intelligence.
Rules:
- Only use the product information given to you. Do not invent factual product features that were not provided.
- You may make reasonable, clearly-labeled marketing inferences (e.g. likely audiences, likely use cases) based on the available context.
- Place any uncertain or unknown information into the missingInformation field instead of guessing as fact.
- Produce useful, professional marketing intelligence.
- Respond with a single JSON object only, matching the requested schema exactly.
- Do not include markdown, code fences, or any explanatory text outside the JSON object.`;

export function buildProductUnderstandingPrompt(product: ProductPromptInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  const userPrompt = `Analyze the following product and return a JSON object with exactly these fields:
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

Product information:
Name: ${product.name}
Website: ${product.websiteUrl ?? 'not provided'}
Short description: ${product.shortDescription ?? 'not provided'}
Product type: ${product.productType ?? 'not provided'}
Primary goal: ${product.primaryGoal ?? 'not provided'}
Target markets: ${product.targetMarkets?.length ? product.targetMarkets.join(', ') : 'not provided'}`;

  return { systemPrompt: SYSTEM_PROMPT, userPrompt };
}
