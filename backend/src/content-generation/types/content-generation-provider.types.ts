// Normalized provider boundary — no OpenAI-specific (or any other vendor's)
// response object ever crosses this line into the engine.
export interface ContentGenerationProviderRequest {
  prompt: string;
  systemPrompt?: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
}

export interface ContentGenerationProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface ContentGenerationProviderResponse {
  content: string;
  model: string;
  finishReason?: string;
  usage?: ContentGenerationProviderUsage;
}
