import type { ContentGenerationProviderRequest, ContentGenerationProviderResponse } from '../types/content-generation-provider.types';

// Any future provider (Anthropic, a local model, etc.) implements this and
// is swapped in via CONTENT_GENERATION_PROVIDER — no content-type code changes.
export interface ContentGenerationProvider {
  readonly name: string;

  isConfigured(): boolean;

  generate(request: ContentGenerationProviderRequest): Promise<ContentGenerationProviderResponse>;
}
