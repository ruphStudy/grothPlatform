export interface GenerateStructuredParams {
  systemPrompt: string;
  userPrompt: string;
  billing?: {
    organizationId: string;
    productId?: string;
    feature: string;
    action: string;
    sourceType: string;
    sourceEntityId?: string;
    idempotencyKey?: string;
  };
}

export interface AiProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  providerCostMinor?: number;
  providerCostCurrency?: string;
}

export interface AiProviderResult<T> {
  data: T;
  usage?: AiProviderUsage;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  generateStructured<T>(params: GenerateStructuredParams): Promise<AiProviderResult<T>>;
}
