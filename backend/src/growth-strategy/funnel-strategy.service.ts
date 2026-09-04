import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChannelFit, GrowthChannel, GrowthChannelFitResult } from './types/growth-channel-fit.types';
import type { FunnelStage, FunnelStageStrategy, FunnelStrategyResult } from './types/funnel-strategy.types';
import type { GrowthObjective, GrowthObjectiveResult, GrowthObjectiveType } from './types/growth-objective.types';
import type { StrategySignal, StrategySignalResult } from './types/strategy-signal.types';

const DEFAULT_MIN_PRIORITY = 40;
const DEFAULT_MAX_KEYWORDS_PER_STAGE = 10;
const DEFAULT_MAX_CHANNELS_PER_STAGE = 4;

type IntentHint = 'informational' | 'commercial' | 'transactional' | 'comparison' | 'problem' | 'audience_specific';

const STAGE_ORDER: FunnelStage[] = ['awareness', 'consideration', 'conversion', 'activation', 'retention'];

const DISCLAIMER =
  'Funnel strategy is an evidence-based planning hypothesis and should be validated against real customer behavior and conversion data.';

interface StageRule {
  stage: FunnelStage;
  objectiveTypes: GrowthObjectiveType[];
  intentHints: IntentHint[];
  channelNames: GrowthChannel[];
  actions: string[];
  entrySignals: string[];
  successSignals: string[];
}

const STAGE_RULES: StageRule[] = [
  {
    stage: 'awareness',
    objectiveTypes: ['awareness', 'education'],
    intentHints: ['informational', 'problem'],
    channelNames: ['seo', 'content', 'organic_social'],
    actions: ['Category education content', 'Pain/problem education content', 'Educational discovery content'],
    entrySignals: ['Informational search or problem discovery'],
    successSignals: ['Qualified traffic', 'Search visibility', 'Content engagement'],
  },
  {
    stage: 'consideration',
    objectiveTypes: ['consideration', 'positioning', 'differentiation'],
    intentHints: ['commercial', 'comparison', 'audience_specific'],
    channelNames: ['seo', 'content', 'paid_search', 'community'],
    actions: ['Product/category comparison content', 'Use-case education content', 'Feature/value differentiation content', 'Buyer evaluation support materials'],
    entrySignals: ['Solution/commercial search'],
    successSignals: ['Product-page engagement', 'Comparison/evaluation engagement', 'Returning visitors'],
  },
  {
    stage: 'conversion',
    objectiveTypes: ['conversion', 'lead_generation', 'buyer_enablement'],
    intentHints: ['transactional', 'commercial', 'comparison'],
    channelNames: ['paid_search', 'email', 'outbound', 'product_led'],
    actions: ['Lead capture', 'Buyer proof/evaluation assets', 'Conversion action (trial, demo, or signup) aligned with the product delivery model'],
    entrySignals: ['Transactional or high-intent visit'],
    successSignals: ['Signup/demo/lead conversion', 'CTA completion'],
  },
  {
    stage: 'activation',
    objectiveTypes: ['activation'],
    intentHints: [],
    channelNames: ['product_led'],
    actions: ['Onboarding guidance', 'First-value workflow support', 'Use-case activation guidance'],
    entrySignals: ['New signup/user'],
    successSignals: ['Onboarding completion', 'First-value action'],
  },
  {
    stage: 'retention',
    objectiveTypes: ['retention'],
    intentHints: [],
    channelNames: [],
    actions: ['Retention/repeat-usage programs'],
    entrySignals: ['Existing active user'],
    successSignals: ['Repeat usage', 'Returning active users'],
  },
];

interface Context {
  byCategory: Map<string, StrategySignal[]>;
  keywordHints: Map<string, Set<IntentHint>>;
  objectiveByType: Map<GrowthObjectiveType, GrowthObjective>;
  channelByName: Map<GrowthChannel, ChannelFit>;
}

export interface FunnelStrategyInput {
  signals: StrategySignalResult;
  objectives: GrowthObjectiveResult;
  channels: GrowthChannelFitResult;
}

@Injectable()
export class FunnelStrategyService {
  constructor(private readonly configService: ConfigService) {}

  build(input: FunnelStrategyInput): FunnelStrategyResult {
    const ctx = this.buildContext(input);
    const minPriority = this.getMinPriority();

    const stages = STAGE_RULES.map((rule) => this.buildStage(rule, ctx))
      .filter((s): s is FunnelStageStrategy => s !== null && s.priorityScore >= minPriority);

    const awareness = stages.find((s) => s.stage === 'awareness');
    const consideration = stages.find((s) => s.stage === 'consideration');
    let primaryEntryStage: FunnelStage | undefined;
    if (awareness && consideration) {
      primaryEntryStage = awareness.priorityScore >= consideration.priorityScore ? 'awareness' : 'consideration';
    } else if (awareness) {
      primaryEntryStage = 'awareness';
    } else if (consideration) {
      primaryEntryStage = 'consideration';
    }

    const presentStageSet = new Set(stages.map((s) => s.stage));
    const primaryConversionPath = STAGE_ORDER.filter((s) => presentStageSet.has(s));

    const missingEvidence: string[] = [];
    if (!presentStageSet.has('activation')) missingEvidence.push('No strong activation evidence was found; the activation stage was omitted rather than fabricated.');
    if (!presentStageSet.has('retention')) missingEvidence.push('No retention/repeat-usage evidence was found; the retention stage was omitted rather than fabricated.');

    const confidenceScore = stages.length
      ? Math.round(stages.reduce((sum, s) => sum + s.confidenceScore, 0) / stages.length)
      : 0;

    return {
      stages,
      primaryEntryStage,
      primaryConversionPath,
      confidenceScore,
      missingEvidence,
      warnings: [DISCLAIMER],
      generatedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------
  // Context
  // ---------------------------------------------------------------------

  private buildContext(input: FunnelStrategyInput): Context {
    const byCategory = new Map<string, StrategySignal[]>();
    for (const s of input.signals.signals) {
      const list = byCategory.get(s.category) ?? [];
      list.push(s);
      byCategory.set(s.category, list);
    }

    const keywordHints = new Map<string, Set<IntentHint>>();
    for (const s of byCategory.get('keyword') ?? []) {
      keywordHints.set(s.id, this.inferKeywordIntentHints(s.value));
    }

    const objectiveByType = new Map(input.objectives.objectives.map((o) => [o.type, o]));
    const channelByName = new Map(input.channels.channels.map((c) => [c.channel, c]));

    return { byCategory, keywordHints, objectiveByType, channelByName };
  }

  private inferKeywordIntentHints(value: string): Set<IntentHint> {
    const v = value.toLowerCase();
    const hints = new Set<IntentHint>();
    if (/\b(how|guide|learn|tips|what is|practice)\b/.test(v)) hints.add('informational');
    if (/\b(software|platform|tool|solution|service|best)\b/.test(v)) hints.add('commercial');
    if (/\b(pricing|plans?|buy|trial|sign ?up)\b/.test(v)) hints.add('transactional');
    if (/\b(best|vs|versus|alternatives?|comparison)\b/.test(v)) hints.add('comparison');
    if (/\b(reduce|improve|fix|manual|slow|inconsistent|lack|difficult)\b/.test(v)) hints.add('problem');
    if (/\bfor [a-z]/.test(v)) hints.add('audience_specific');
    return hints;
  }

  private find(ctx: Context, category: string, title: string): StrategySignal | undefined {
    return (ctx.byCategory.get(category) ?? []).find((s) => s.title === title);
  }

  private audienceSignalFor(ctx: Context, stage: FunnelStage): StrategySignal | undefined {
    if (stage === 'awareness' || stage === 'consideration') {
      return this.find(ctx, 'audience', 'Primary Audience') ?? this.find(ctx, 'audience', 'Primary Use Case');
    }
    if (stage === 'conversion') {
      return this.find(ctx, 'audience', 'Ideal Customer Profile') ?? this.find(ctx, 'commercial', 'Buyer Role');
    }
    if (stage === 'activation') {
      return this.find(ctx, 'audience', 'Primary Use Case');
    }
    return undefined;
  }

  // ---------------------------------------------------------------------
  // Stage building
  // ---------------------------------------------------------------------

  private buildStage(rule: StageRule, ctx: Context): FunnelStageStrategy | null {
    const objectives = rule.objectiveTypes.map((t) => ctx.objectiveByType.get(t)).filter((o): o is GrowthObjective => !!o);
    const keywordSignals = rule.intentHints.length
      ? (ctx.byCategory.get('keyword') ?? []).filter((s) => {
          const hints = ctx.keywordHints.get(s.id);
          return hints ? rule.intentHints.some((h) => hints.has(h)) : false;
        })
      : [];
    const channels = rule.channelNames.map((n) => ctx.channelByName.get(n)).filter((c): c is ChannelFit => !!c);
    const audienceSignal = this.audienceSignalFor(ctx, rule.stage);

    const hasAnyEvidence = objectives.length > 0 || keywordSignals.length > 0 || channels.length > 0 || !!audienceSignal;
    if (!hasAnyEvidence) return null;

    // Priority: objective alignment 40%, audience relevance 20%, channel support 20%, keyword-intent support 20%
    const dims: { weight: number; value: number }[] = [];
    dims.push({ weight: 0.4, value: objectives.length ? this.mean(objectives.map((o) => o.priorityScore)) : 0 });
    if (audienceSignal) dims.push({ weight: 0.2, value: audienceSignal.strengthScore });
    if (channels.length > 0) dims.push({ weight: 0.2, value: this.mean(channels.map((c) => c.fitScore)) });
    if (keywordSignals.length > 0) dims.push({ weight: 0.2, value: this.mean(keywordSignals.map((s) => s.strengthScore)) });
    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    const priorityScore = totalWeight > 0 ? this.clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100) : 0;

    const confDims: { weight: number; value: number }[] = [];
    if (objectives.length) confDims.push({ weight: 0.3, value: this.mean(objectives.map((o) => o.confidenceScore)) });
    if (channels.length) confDims.push({ weight: 0.3, value: this.mean(channels.map((c) => c.confidenceScore)) });
    if (audienceSignal) confDims.push({ weight: 0.2, value: audienceSignal.confidenceScore });
    if (keywordSignals.length) confDims.push({ weight: 0.2, value: this.mean(keywordSignals.map((s) => s.confidenceScore)) });
    const confTotalWeight = confDims.reduce((sum, d) => sum + d.weight, 0);
    const confidenceScore = confTotalWeight > 0 ? this.clamp(Math.round(confDims.reduce((sum, d) => sum + d.weight * d.value, 0) / confTotalWeight), 0, 100) : 0;

    const audienceSegmentIds = this.dedupe([
      ...(audienceSignal?.relatedSegmentIds ?? []),
      ...objectives.flatMap((o) => o.relatedAudienceSegmentIds),
      ...channels.flatMap((c) => c.relatedAudienceSegmentIds),
    ]);
    const keywords = this.dedupe(keywordSignals.map((s) => s.value)).slice(0, this.getMaxKeywordsPerStage());
    const channelNames = this.dedupe(channels.map((c) => c.channel)).slice(0, this.getMaxChannelsPerStage());
    const keywordIntents = this.dedupe(rule.intentHints);

    const reasons: string[] = [];
    if (objectives.length) reasons.push(`Supported by objective(s): ${objectives.map((o) => o.title).join(', ')}.`);
    if (channelNames.length) reasons.push(`Supported by channel(s): ${channelNames.join(', ')}.`);
    if (keywordSignals.length) reasons.push(`Supported by ${keywordSignals.length} keyword signal(s) matching ${keywordIntents.join('/')} intent.`);
    if (audienceSignal) reasons.push(`Supported by audience evidence: "${audienceSignal.value}".`);

    const warnings: string[] = [];
    if (dims.length <= 1) warnings.push('This stage is based on limited supporting evidence; validate before prioritizing.');

    return {
      stage: rule.stage,
      objective: objectives[0]?.title ?? '',
      priorityScore,
      confidenceScore,
      audienceSegmentIds,
      channels: channelNames,
      keywordIntents,
      keywords,
      recommendedActions: rule.actions,
      entrySignals: rule.entrySignals,
      successSignals: rule.successSignals,
      reasons,
      warnings: this.dedupe(warnings),
    };
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

  private getMinPriority(): number {
    return this.getEnvNumber('FUNNEL_STAGE_MIN_PRIORITY', DEFAULT_MIN_PRIORITY);
  }

  private getMaxKeywordsPerStage(): number {
    return this.getEnvNumber('FUNNEL_MAX_KEYWORDS_PER_STAGE', DEFAULT_MAX_KEYWORDS_PER_STAGE);
  }

  private getMaxChannelsPerStage(): number {
    return this.getEnvNumber('FUNNEL_MAX_CHANNELS_PER_STAGE', DEFAULT_MAX_CHANNELS_PER_STAGE);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
