export interface GenerateStructuredParams {
  systemPrompt: string;
  userPrompt: string;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  generateStructured<T>(params: GenerateStructuredParams): Promise<T>;
}
