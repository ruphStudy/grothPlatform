import type { ContentGenerationCost, ContentGenerationUsage } from '../types/content-generation.types';

// Approximate USD-per-1K-token pricing for models this engine is known to
// call. No repo-wide pricing utility exists yet (see Sprint 15A investigation
// notes) — this table is intentionally scoped to content generation only,
// not a general-purpose cost system. Extend it as new models are configured;
// never guess a price for a model that isn't listed here.
const MODEL_PRICING_USD_PER_1K_TOKENS: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
};

export function estimateContentGenerationCost(model: string, usage: ContentGenerationUsage): ContentGenerationCost | undefined {
  const pricing = MODEL_PRICING_USD_PER_1K_TOKENS[model];
  if (!pricing || usage.inputTokens === undefined || usage.outputTokens === undefined) return undefined;

  const estimated = (usage.inputTokens / 1000) * pricing.input + (usage.outputTokens / 1000) * pricing.output;
  return { currency: 'USD', estimated: Math.round(estimated * 1e6) / 1e6 };
}
