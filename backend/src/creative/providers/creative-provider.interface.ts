import type { CreativeProviderRequest, CreativeProviderResponse } from './creative-provider.types';

// Nest injection token for the configured CreativeProvider. The engine
// depends only on this token + interface, never on a concrete provider
// class, so a real image provider (17C+) can be swapped in via module
// registration without any engine or feature-code change.
export const CREATIVE_PROVIDER_TOKEN = 'CREATIVE_PROVIDER_TOKEN';

// Any future provider (DALL-E, Stable Diffusion, Midjourney, etc.)
// implements this. Provider-specific SDK objects must never escape this
// boundary — generate() takes and returns only the normalized shapes above.
export interface CreativeProvider {
  readonly name: string;

  isConfigured(): boolean;

  generate(request: CreativeProviderRequest): Promise<CreativeProviderResponse>;
}
