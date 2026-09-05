import type { ContentGenerationResult } from '../types/content-generation.types';
import type { ContentVersionGenerationMetadata, ContentVersionSourceContext } from '../types/content-versioning.types';

// Shared by every 15C-15I adapter — assembles the safe, already-normalized
// generation accounting persisted with each version. Never includes
// systemPrompt, the full generation prompt, or the raw provider response.
export function buildGenerationMetadata(
  generation: ContentGenerationResult,
  promptVersion: string,
  sourceContext: ContentVersionSourceContext | undefined,
  warnings: string[],
): ContentVersionGenerationMetadata {
  return {
    provider: generation.provider,
    model: generation.model,
    promptVersion,
    usage: generation.usage,
    cost: generation.cost,
    sourceContext,
    warnings,
    generatedAt: generation.generatedAt,
  };
}
