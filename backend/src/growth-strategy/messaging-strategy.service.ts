import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FunnelStage, FunnelStageStrategy, FunnelStrategyResult } from './types/funnel-strategy.types';
import type { GrowthChannelFitResult } from './types/growth-channel-fit.types';
import type { GrowthObjective, GrowthObjectiveResult, GrowthObjectiveType } from './types/growth-objective.types';
import type { AudienceMessage, FunnelMessage, MessagingPillar, MessagingStrategyResult } from './types/messaging-strategy.types';
import type { StrategySignal, StrategySignalResult } from './types/strategy-signal.types';

const DEFAULT_MAX_PILLARS = 6;
const DEFAULT_MAX_AUDIENCES = 6;
const DEFAULT_MAX_KEYWORDS_PER_PILLAR = 8;

const DISCLAIMER =
  'Messaging strategy is derived from existing product, audience, market, and keyword evidence and should be validated with real customer language and testing.';

const AVOID_CLAIMS = [
  'Avoid unsupported market-leadership claims.',
  'Avoid guaranteed outcome/performance claims.',
  'Avoid invented customer statistics.',
  'Avoid competitor claims not supported by public evidence.',
];

const FUNNEL_TEMPLATES: Record<FunnelStage, { goal: string; themes: string[]; cta: string[] }> = {
  awareness: {
    goal: 'Educate on the problem/category',
    themes: ['Problem awareness', 'Category understanding'],
    cta: ['Learn more', 'Explore the topic'],
  },
  consideration: {
    goal: 'Prove relevance and differentiation',
    themes: ['Use-case fit', 'Value proposition', 'Comparison', 'Proof of capability'],
    cta: ['Compare options', 'Evaluate the product', 'Explore further'],
  },
  conversion: {
    goal: 'Reduce decision friction',
    themes: ['Proof/evidence', 'Buyer confidence', 'Clear next step'],
    cta: ['Take the next conversion action'],
  },
  activation: {
    goal: 'Reach first value quickly',
    themes: ['Onboarding guidance', 'Use-case success'],
    cta: ['Complete onboarding', 'Achieve first value'],
  },
  retention: {
    goal: 'Sustain engagement and repeat value',
    themes: ['Repeat-value reinforcement'],
    cta: ['Continue engagement'],
  },
};

interface RawPillar {
  theme: string;
  title: string;
  anchorSignal: StrategySignal;
  supportingSignals: StrategySignal[];
  objectives: GrowthObjective[];
  funnelStages: FunnelStage[];
  keywordSignals: StrategySignal[];
  reasons: string[];
}

interface Context {
  byCategory: Map<string, StrategySignal[]>;
  keywordSignals: StrategySignal[];
  objectiveByType: Map<GrowthObjectiveType, GrowthObjective>;
  stagesByName: Map<FunnelStage, FunnelStageStrategy>;
}

export interface MessagingStrategyInput {
  signals: StrategySignalResult;
  objectives: GrowthObjectiveResult;
  channels: GrowthChannelFitResult;
  funnel: FunnelStrategyResult;
}

@Injectable()
export class MessagingStrategyService {
  constructor(private readonly configService: ConfigService) {}

  build(input: MessagingStrategyInput): MessagingStrategyResult {
    const ctx = this.buildContext(input);

    const rawPillars = [
      this.pillarCoreValue(ctx),
      this.pillarPainRelief(ctx),
      this.pillarUseCaseEffectiveness(ctx),
      this.pillarDifferentiation(ctx),
      this.pillarBuyerConfidence(ctx),
      this.pillarEaseActivation(ctx),
      this.pillarCategoryEducation(ctx),
    ].filter((p): p is RawPillar => p !== null);

    const pillars = rawPillars
      .map((p) => this.finalizePillar(p))
      .sort((a, b) => b.priorityScore - a.priorityScore || b.confidenceScore - a.confidenceScore || a.id.localeCompare(b.id))
      .slice(0, this.getMaxPillars());

    const primaryPillarId = pillars[0]?.id;

    const audienceMessages = this.buildAudienceMessages(ctx, pillars);
    const funnelMessages = this.buildFunnelMessages(ctx, pillars);

    const toneGuidance = this.buildToneGuidance(ctx);
    const missingEvidence = this.buildMissingEvidence(ctx, pillars);

    const confidenceScores = [
      ...pillars.map((p) => p.confidenceScore),
      ...audienceMessages.map((m) => m.confidenceScore),
      ...funnelMessages.map((m) => m.confidenceScore),
    ];
    const confidenceScore = confidenceScores.length ? Math.round(this.mean(confidenceScores)) : 0;

    return {
      pillars,
      audienceMessages,
      funnelMessages,
      primaryPillarId,
      toneGuidance,
      avoidClaims: [...AVOID_CLAIMS],
      confidenceScore,
      missingEvidence,
      warnings: [DISCLAIMER],
      generatedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------
  // Context
  // ---------------------------------------------------------------------

  private buildContext(input: MessagingStrategyInput): Context {
    const byCategory = new Map<string, StrategySignal[]>();
    for (const s of input.signals.signals) {
      const list = byCategory.get(s.category) ?? [];
      list.push(s);
      byCategory.set(s.category, list);
    }
    const objectiveByType = new Map(input.objectives.objectives.map((o) => [o.type, o]));
    const stagesByName = new Map(input.funnel.stages.map((s) => [s.stage, s]));

    return { byCategory, keywordSignals: byCategory.get('keyword') ?? [], objectiveByType, stagesByName };
  }

  private find(ctx: Context, category: string, title: string): StrategySignal | undefined {
    return (ctx.byCategory.get(category) ?? []).find((s) => s.title === title);
  }

  private objectivesOf(ctx: Context, types: GrowthObjectiveType[]): GrowthObjective[] {
    return types.map((t) => ctx.objectiveByType.get(t)).filter((o): o is GrowthObjective => !!o);
  }

  private stagesOf(ctx: Context, stages: FunnelStage[]): FunnelStage[] {
    return stages.filter((s) => ctx.stagesByName.has(s));
  }

  private keywordSignalsFor(ctx: Context, pattern: RegExp): StrategySignal[] {
    return ctx.keywordSignals.filter((s) => pattern.test(s.value.toLowerCase()));
  }

  // ---------------------------------------------------------------------
  // Pillar rules
  // ---------------------------------------------------------------------

  private pillarCoreValue(ctx: Context): RawPillar | null {
    const valueSignal = this.find(ctx, 'positioning', 'Value Proposition') ?? this.find(ctx, 'positioning', 'Suggested Positioning') ?? this.find(ctx, 'audience', 'Primary Use Case');
    if (!valueSignal) return null;

    return {
      theme: 'core_value_outcome',
      title: `Core Value: ${valueSignal.value}`,
      anchorSignal: valueSignal,
      supportingSignals: [valueSignal],
      objectives: this.objectivesOf(ctx, ['consideration', 'positioning']),
      funnelStages: this.stagesOf(ctx, ['awareness', 'consideration']),
      keywordSignals: this.keywordSignalsFor(ctx, /\b(software|platform|tool|solution|service|best)\b/),
      reasons: [`Anchored on core value/outcome evidence: "${valueSignal.value}".`],
    };
  }

  private pillarPainRelief(ctx: Context): RawPillar | null {
    const painSignal = (ctx.byCategory.get('pain') ?? [])[0];
    if (!painSignal) return null;

    return {
      theme: 'pain_relief',
      title: `Relieve: ${painSignal.value}`,
      anchorSignal: painSignal,
      supportingSignals: [painSignal],
      objectives: this.objectivesOf(ctx, ['awareness', 'education']),
      funnelStages: this.stagesOf(ctx, ['awareness']),
      keywordSignals: this.keywordSignalsFor(ctx, /\b(reduce|improve|fix|manual|slow|inconsistent|lack|difficult)\b/),
      reasons: [`Anchored on audience pain evidence: "${painSignal.value}".`],
    };
  }

  private pillarUseCaseEffectiveness(ctx: Context): RawPillar | null {
    const useCaseSignal = this.find(ctx, 'audience', 'Primary Use Case');
    const jtbdSignal = (ctx.byCategory.get('jtbd') ?? [])[0];
    if (!useCaseSignal) return null;

    return {
      theme: 'use_case_effectiveness',
      title: `Use-Case Effectiveness: ${useCaseSignal.value}`,
      anchorSignal: useCaseSignal,
      supportingSignals: jtbdSignal ? [useCaseSignal, jtbdSignal] : [useCaseSignal],
      objectives: this.objectivesOf(ctx, ['consideration', 'activation']),
      funnelStages: this.stagesOf(ctx, ['consideration', 'activation']),
      keywordSignals: this.keywordSignalsFor(ctx, /\bfor [a-z]/),
      reasons: [`Anchored on primary use-case evidence: "${useCaseSignal.value}".`],
    };
  }

  private pillarDifferentiation(ctx: Context): RawPillar | null {
    const differentiation = ctx.byCategory.get('differentiation') ?? [];
    const coverageGap = (ctx.byCategory.get('competitor') ?? []).filter((s) => s.title === 'Competitive Coverage Gap');
    const anchor = differentiation[0] ?? coverageGap[0];
    if (!anchor) return null;

    return {
      theme: 'differentiation',
      title: `Differentiation: ${anchor.value}`,
      anchorSignal: anchor,
      supportingSignals: [...differentiation, ...coverageGap].slice(0, 3),
      objectives: this.objectivesOf(ctx, ['differentiation', 'consideration']),
      funnelStages: this.stagesOf(ctx, ['consideration', 'conversion']),
      keywordSignals: this.keywordSignalsFor(ctx, /\b(best|vs|versus|alternatives?|comparison)\b/),
      reasons: [`Anchored on differentiation/competitor-gap evidence: "${anchor.value}".`],
    };
  }

  private pillarBuyerConfidence(ctx: Context): RawPillar | null {
    const buyerSignal = this.find(ctx, 'commercial', 'Buyer Role');
    if (!buyerSignal) return null;

    return {
      theme: 'buyer_confidence',
      title: `Buyer Confidence: ${buyerSignal.value}`,
      anchorSignal: buyerSignal,
      supportingSignals: [buyerSignal],
      objectives: this.objectivesOf(ctx, ['lead_generation', 'buyer_enablement']),
      funnelStages: this.stagesOf(ctx, ['consideration', 'conversion']),
      keywordSignals: this.keywordSignalsFor(ctx, /\b(best|vs|versus|alternatives?|comparison)\b/),
      reasons: [`Anchored on buyer-role evidence: "${buyerSignal.value}".`],
    };
  }

  private pillarEaseActivation(ctx: Context): RawPillar | null {
    const useCaseSignal = this.find(ctx, 'audience', 'Primary Use Case');
    const activationObjective = ctx.objectiveByType.get('activation');
    if (!useCaseSignal || !activationObjective) return null;

    return {
      theme: 'ease_activation',
      title: `Ease of Adoption: ${useCaseSignal.value}`,
      anchorSignal: useCaseSignal,
      supportingSignals: [useCaseSignal],
      objectives: [activationObjective],
      funnelStages: this.stagesOf(ctx, ['activation']),
      keywordSignals: [],
      reasons: [`Anchored on self-service use-case evidence with an activation objective: "${useCaseSignal.value}".`],
    };
  }

  private pillarCategoryEducation(ctx: Context): RawPillar | null {
    const categorySignal = this.find(ctx, 'product', 'Product Category');
    const informational = this.keywordSignalsFor(ctx, /\b(how|guide|learn|tips|what is|practice)\b/);
    const objectives = this.objectivesOf(ctx, ['awareness', 'education']);
    if (!categorySignal || (informational.length === 0 && objectives.length === 0)) return null;

    return {
      theme: 'category_education',
      title: `Category Education: ${categorySignal.value}`,
      anchorSignal: categorySignal,
      supportingSignals: [categorySignal],
      objectives,
      funnelStages: this.stagesOf(ctx, ['awareness']),
      keywordSignals: informational,
      reasons: [`Anchored on product-category evidence: "${categorySignal.value}".`],
    };
  }

  // ---------------------------------------------------------------------
  // Pillar scoring
  // ---------------------------------------------------------------------

  private finalizePillar(raw: RawPillar): MessagingPillar {
    const dims: { weight: number; value: number }[] = [
      { weight: 0.4, value: this.mean(raw.supportingSignals.map((s) => s.strengthScore)) },
    ];
    if (raw.anchorSignal.category === 'audience') dims.push({ weight: 0.25, value: raw.anchorSignal.strengthScore });
    if (raw.objectives.length > 0) dims.push({ weight: 0.2, value: this.mean(raw.objectives.map((o) => o.priorityScore)) });
    if (raw.keywordSignals.length > 0) dims.push({ weight: 0.15, value: this.mean(raw.keywordSignals.map((s) => s.strengthScore)) });
    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    const priorityScore = this.clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100);

    const allEvidence = [...raw.supportingSignals, ...raw.keywordSignals];
    const distinctCategories = new Set(allEvidence.map((s) => s.category)).size;
    const confidenceScore = this.clamp(
      Math.round(this.mean(allEvidence.map((s) => s.confidenceScore)) * 0.75 + Math.min(25, distinctCategories * 10)),
      0,
      100,
    );

    const targetAudienceSegmentIds = this.dedupe(raw.supportingSignals.flatMap((s) => s.relatedSegmentIds ?? []));
    const supportingKeywords = this.dedupe(raw.keywordSignals.map((s) => s.value)).slice(0, this.getMaxKeywordsPerPillar());

    return {
      id: raw.theme.replace(/_/g, '-'),
      title: raw.title,
      theme: raw.theme,
      priorityScore,
      confidenceScore,
      targetAudienceSegmentIds,
      relatedObjectiveIds: this.dedupe(raw.objectives.map((o) => o.id)),
      relatedFunnelStages: this.dedupe(raw.funnelStages),
      supportingSignalIds: this.dedupe(raw.supportingSignals.map((s) => s.id)),
      supportingKeywords,
      reasons: raw.reasons,
      warnings: [],
    };
  }

  // ---------------------------------------------------------------------
  // Audience messages
  // ---------------------------------------------------------------------

  private buildAudienceMessages(ctx: Context, pillars: MessagingPillar[]): AudienceMessage[] {
    const audienceSignals = (ctx.byCategory.get('audience') ?? []).filter(
      (s) => (s.title === 'Primary Audience' || s.title === 'Ideal Customer Profile') && s.strengthScore >= 50,
    );

    const coreValueSignal = this.find(ctx, 'positioning', 'Value Proposition') ?? this.find(ctx, 'positioning', 'Suggested Positioning');
    const differentiationSignals = ctx.byCategory.get('differentiation') ?? [];
    const buyerSignal = this.find(ctx, 'commercial', 'Buyer Role');

    return audienceSignals.slice(0, this.getMaxAudiences()).map((audienceSignal) => {
      const segmentIds = audienceSignal.relatedSegmentIds ?? [];
      const inSegment = (s: StrategySignal) => (s.relatedSegmentIds ?? []).some((id) => segmentIds.includes(id));

      const painSignal = (ctx.byCategory.get('pain') ?? []).find(inSegment) ?? (ctx.byCategory.get('pain') ?? [])[0];
      const jtbdSignal = (ctx.byCategory.get('jtbd') ?? []).find(inSegment) ?? (ctx.byCategory.get('jtbd') ?? [])[0];

      const primaryNeed = painSignal?.value ?? jtbdSignal?.value ?? `Support "${audienceSignal.value}" effectively`;
      const valueMessage = coreValueSignal?.value ?? `Deliver clear, relevant value for "${audienceSignal.value}".`;

      const proofFocus = this.dedupe([
        ...differentiationSignals.filter((s) => segmentIds.length === 0 || inSegment(s)).map((s) => s.value),
      ]).slice(0, 5);

      const objectionFocus: string[] = [];
      if (!buyerSignal) objectionFocus.push('Pricing/decision uncertainty');
      if (differentiationSignals.length === 0) objectionFocus.push('Unclear differentiation');
      if (audienceSignal.confidenceScore < 60) objectionFocus.push('Trust/proof gap');

      const supportingSignals = [audienceSignal, painSignal, jtbdSignal].filter((s): s is StrategySignal => !!s);
      const confidenceScore = this.clamp(Math.round(this.mean(supportingSignals.map((s) => s.confidenceScore))), 0, 100);

      return {
        audienceSegmentId: segmentIds[0] ?? audienceSignal.id,
        primaryNeed,
        valueMessage,
        proofFocus,
        objectionFocus: this.dedupe(objectionFocus),
        confidenceScore,
        supportingSignalIds: this.dedupe(supportingSignals.map((s) => s.id)),
      };
    });
  }

  // ---------------------------------------------------------------------
  // Funnel messages
  // ---------------------------------------------------------------------

  private buildFunnelMessages(ctx: Context, pillars: MessagingPillar[]): FunnelMessage[] {
    const order: FunnelStage[] = ['awareness', 'consideration', 'conversion', 'activation', 'retention'];
    return order
      .filter((stage) => ctx.stagesByName.has(stage))
      .map((stage) => {
        const template = FUNNEL_TEMPLATES[stage];
        const stageEntry = ctx.stagesByName.get(stage)!;
        const relatedPillars = pillars.filter((p) => p.relatedFunnelStages.includes(stage));
        const proofFocus = this.dedupe(relatedPillars.flatMap((p) => [p.title, ...p.supportingKeywords])).slice(0, 5);

        return {
          stage,
          messageGoal: template.goal,
          messageThemes: template.themes,
          proofFocus,
          ctaDirection: template.cta,
          confidenceScore: stageEntry.confidenceScore,
        };
      });
  }

  // ---------------------------------------------------------------------
  // Tone / missing evidence
  // ---------------------------------------------------------------------

  private buildToneGuidance(ctx: Context): string[] {
    const candidates: string[] = [];
    if (this.find(ctx, 'commercial', 'Buyer Role')) candidates.push('professional', 'technically credible');
    if ((ctx.byCategory.get('pain') ?? []).length > 0 || (ctx.byCategory.get('jtbd') ?? []).length > 0) candidates.push('educational');
    if (this.find(ctx, 'audience', 'Primary Use Case')) candidates.push('practical', 'outcome-oriented');
    candidates.push('evidence-based', 'concise');
    return this.dedupe(candidates).slice(0, 5);
  }

  private buildMissingEvidence(ctx: Context, pillars: MessagingPillar[]): string[] {
    const missing: string[] = [];
    if (!pillars.some((p) => p.theme === 'differentiation')) missing.push('No differentiation evidence was found; differentiation messaging was omitted.');
    if (!this.find(ctx, 'commercial', 'Buyer Role')) missing.push('No buyer-role evidence was found; buyer-confidence messaging was omitted.');
    if ((ctx.byCategory.get('audience') ?? []).length === 0) missing.push('No audience evidence was found; audience-specific messaging could not be derived.');
    return missing;
  }

  // ---------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------

  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private dedupe(items: string[]): string[] {
    return Array.from(new Set(items.filter((i) => i && i.trim())));
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private getMaxPillars(): number {
    return this.getEnvNumber('MESSAGING_MAX_PILLARS', DEFAULT_MAX_PILLARS);
  }

  private getMaxAudiences(): number {
    return this.getEnvNumber('MESSAGING_MAX_AUDIENCES', DEFAULT_MAX_AUDIENCES);
  }

  private getMaxKeywordsPerPillar(): number {
    return this.getEnvNumber('MESSAGING_MAX_KEYWORDS_PER_PILLAR', DEFAULT_MAX_KEYWORDS_PER_PILLAR);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
