import { BUSINESS_MODELS } from './schemas/product-intelligence-profile.schema';

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export function normalizeAnalysisResult(raw: unknown): Record<string, unknown> {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const rawAudiences = Array.isArray(source.targetAudiences) ? source.targetAudiences : [];
  const targetAudiences = rawAudiences.map((item) => {
    const audience = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    return {
      name: typeof audience.name === 'string' ? audience.name : '',
      description: typeof audience.description === 'string' ? audience.description : '',
      painPoints: toStringArray(audience.painPoints),
      goals: toStringArray(audience.goals),
    };
  });

  const score = Number(source.confidenceScore);

  return {
    summary: typeof source.summary === 'string' ? source.summary : '',
    category: typeof source.category === 'string' ? source.category : '',
    businessModel: (BUSINESS_MODELS as readonly string[]).includes(source.businessModel as string)
      ? source.businessModel
      : 'unknown',
    valueProposition: typeof source.valueProposition === 'string' ? source.valueProposition : '',
    coreFeatures: toStringArray(source.coreFeatures),
    problemsSolved: toStringArray(source.problemsSolved),
    targetAudiences,
    likelyUseCases: toStringArray(source.likelyUseCases),
    differentiators: toStringArray(source.differentiators),
    suggestedPositioning: typeof source.suggestedPositioning === 'string' ? source.suggestedPositioning : '',
    marketingAngles: toStringArray(source.marketingAngles),
    missingInformation: toStringArray(source.missingInformation),
    confidenceScore: Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0,
  };
}
