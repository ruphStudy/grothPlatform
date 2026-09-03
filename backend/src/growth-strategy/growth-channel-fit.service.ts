import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GrowthObjective, GrowthObjectiveResult, GrowthObjectiveType } from './types/growth-objective.types';
import type { ChannelFit, GrowthChannel, GrowthChannelFitResult } from './types/growth-channel-fit.types';
import type { StrategySignal, StrategySignalResult } from './types/strategy-signal.types';

const DEFAULT_MIN_FIT_SCORE = 45;
const DEFAULT_MAX_CHANNELS = 6;

type IntentHint = 'informational' | 'commercial' | 'transactional' | 'comparison' | 'problem';

const DISCLAIMER =
  'Channel-fit scores are evidence-based strategy heuristics and do not predict CAC, ROI, reach, or conversion performance.';

interface ChannelSupport {
  channel: GrowthChannel;
  objectives: GrowthObjective[];
  audienceSignal?: StrategySignal;
  keywordSignals: StrategySignal[];
  useCaseSignal?: StrategySignal;
  extraSignals: StrategySignal[];
  reasons: string[];
  weaknesses: string[];
}

interface Context {
  byCategory: Map<string, StrategySignal[]>;
  keywordHints: Map<string, Set<IntentHint>>;
  objectivesByType: Map<GrowthObjectiveType, GrowthObjective>;
}

export interface GrowthChannelFitInput {
  signals: StrategySignalResult;
  objectives: GrowthObjectiveResult;
}

@Injectable()
export class GrowthChannelFitService {
  constructor(private readonly configService: ConfigService) {}

  evaluate(input: GrowthChannelFitInput): GrowthChannelFitResult {
    const ctx = this.buildContext(input);

    const supports = [
      this.evalSeo(ctx),
      this.evalContent(ctx),
      this.evalOrganicSocial(ctx),
      this.evalPaidSearch(ctx),
      this.evalPaidSocial(ctx),
      this.evalEmail(ctx),
      this.evalCommunity(ctx),
      this.evalPartnerships(ctx),
      this.evalOutbound(ctx),
      this.evalProductLed(ctx),
    ].filter((s): s is ChannelSupport => s !== null);

    const minFit = this.getMinFitScore();
    const channels = supports
      .map((s) => this.buildChannelFit(s))
      .filter((c) => c.fitScore >= minFit)
      .sort((a, b) => b.fitScore - a.fitScore || b.confidenceScore - a.confidenceScore || a.channel.localeCompare(b.channel))
      .slice(0, this.getMaxChannels());

    const top = channels[0];
    const primaryChannel = top ? top.channel : undefined;
    const secondaryChannels = channels.filter((c) => c.channel !== primaryChannel).map((c) => c.channel);

    const confidenceScore = channels.length
      ? Math.round(channels.reduce((sum, c) => sum + c.confidenceScore, 0) / channels.length)
      : 0;

    return {
      channels,
      primaryChannel,
      secondaryChannels,
      confidenceScore,
      warnings: [DISCLAIMER],
      generatedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------
  // Context
  // ---------------------------------------------------------------------

  private buildContext(input: GrowthChannelFitInput): Context {
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

    const objectivesByType = new Map<GrowthObjectiveType, GrowthObjective>();
    for (const o of input.objectives.objectives) objectivesByType.set(o.type, o);

    return { byCategory, keywordHints, objectivesByType };
  }

  private inferKeywordIntentHints(value: string): Set<IntentHint> {
    const v = value.toLowerCase();
    const hints = new Set<IntentHint>();
    if (/\b(how|guide|learn|tips|what is|practice)\b/.test(v)) hints.add('informational');
    if (/\b(software|platform|tool|solution|service|best)\b/.test(v)) hints.add('commercial');
    if (/\b(pricing|plans?|buy|trial|sign ?up)\b/.test(v)) hints.add('transactional');
    if (/\b(best|vs|versus|alternatives?|comparison)\b/.test(v)) hints.add('comparison');
    if (/\b(reduce|improve|fix|manual|slow|inconsistent|lack|difficult)\b/.test(v)) hints.add('problem');
    return hints;
  }

  private keywordSignalsWithHints(ctx: Context, hints: IntentHint[]): StrategySignal[] {
    return (ctx.byCategory.get('keyword') ?? []).filter((s) => {
      const h = ctx.keywordHints.get(s.id);
      return h ? hints.some((hint) => h.has(hint)) : false;
    });
  }

  private strongKeywordSignals(ctx: Context): StrategySignal[] {
    return (ctx.byCategory.get('keyword') ?? []).filter((s) => s.title === 'High-Opportunity Keyword' || s.title === 'Strong Keyword Cluster');
  }

  private find(ctx: Context, category: string, title: string): StrategySignal | undefined {
    return (ctx.byCategory.get(category) ?? []).find((s) => s.title === title);
  }

  private objectivesOf(ctx: Context, types: GrowthObjectiveType[]): GrowthObjective[] {
    return types.map((t) => ctx.objectivesByType.get(t)).filter((o): o is GrowthObjective => !!o);
  }

  // ---------------------------------------------------------------------
  // Channel rules
  // ---------------------------------------------------------------------

  private evalSeo(ctx: Context): ChannelSupport | null {
    const keywordSignals = this.strongKeywordSignals(ctx);
    const objectives = this.objectivesOf(ctx, ['awareness', 'education', 'consideration']);
    if (keywordSignals.length === 0 || objectives.length === 0) return null;

    return {
      channel: 'seo',
      objectives,
      keywordSignals,
      extraSignals: [],
      reasons: ['Strong keyword opportunity/cluster evidence aligns with awareness/education/consideration objectives.'],
      weaknesses: [],
    };
  }

  private evalContent(ctx: Context): ChannelSupport | null {
    const painJtbd = [...(ctx.byCategory.get('pain') ?? []), ...(ctx.byCategory.get('jtbd') ?? [])];
    const informational = this.keywordSignalsWithHints(ctx, ['informational', 'problem']);
    const objectives = this.objectivesOf(ctx, ['education', 'consideration']);
    if (painJtbd.length === 0 || informational.length === 0 || objectives.length === 0) return null;

    return {
      channel: 'content',
      objectives,
      keywordSignals: informational,
      extraSignals: painJtbd,
      reasons: ['Pain/job-to-be-done evidence combined with informational/problem keyword demand supports content marketing.'],
      weaknesses: [],
    };
  }

  private evalOrganicSocial(ctx: Context): ChannelSupport | null {
    const audienceSignal = this.find(ctx, 'audience', 'Primary Audience') ?? this.find(ctx, 'audience', 'Primary Use Case');
    const problemOrInformational = [...(ctx.byCategory.get('pain') ?? []), ...this.keywordSignalsWithHints(ctx, ['informational', 'problem'])];
    const objectives = this.objectivesOf(ctx, ['awareness']);
    if (!audienceSignal || problemOrInformational.length === 0 || objectives.length === 0) return null;

    return {
      channel: 'organic_social',
      objectives,
      audienceSignal,
      keywordSignals: [],
      extraSignals: problemOrInformational,
      reasons: [`Clear audience evidence ("${audienceSignal.value}") plus educational/problem context supports broad-awareness organic social.`],
      weaknesses: [],
    };
  }

  private evalPaidSearch(ctx: Context): ChannelSupport | null {
    const keywordSignals = this.keywordSignalsWithHints(ctx, ['commercial', 'transactional', 'comparison']);
    const objectives = this.objectivesOf(ctx, ['conversion', 'lead_generation']);
    if (keywordSignals.length === 0 || objectives.length === 0) return null;

    return {
      channel: 'paid_search',
      objectives,
      keywordSignals,
      extraSignals: [],
      reasons: ['Commercial/transactional/comparison keyword demand aligns with conversion or lead-generation objectives.'],
      weaknesses: [],
    };
  }

  private evalPaidSocial(ctx: Context): ChannelSupport | null {
    const audienceSignal = this.find(ctx, 'audience', 'Primary Audience') ?? this.find(ctx, 'audience', 'Ideal Customer Profile') ?? this.find(ctx, 'audience', 'Primary Use Case');
    const objectives = this.objectivesOf(ctx, ['awareness', 'lead_generation']);
    if (!audienceSignal || objectives.length === 0) return null;

    return {
      channel: 'paid_social',
      objectives,
      audienceSignal,
      keywordSignals: [],
      extraSignals: [],
      reasons: [`A clearly defined audience segment ("${audienceSignal.value}") supports targeted paid social for awareness or lead generation.`],
      weaknesses: [],
    };
  }

  private evalEmail(ctx: Context): ChannelSupport | null {
    const buyerSignal = this.find(ctx, 'commercial', 'Buyer Role');
    const objectives = this.objectivesOf(ctx, ['lead_generation', 'activation']);
    if (!buyerSignal || objectives.length === 0) return null;

    return {
      channel: 'email',
      objectives,
      extraSignals: [buyerSignal],
      keywordSignals: [],
      reasons: [`An identified buyer relationship ("${buyerSignal.value}") supports email nurturing toward lead generation or activation.`],
      weaknesses: [],
    };
  }

  private evalCommunity(ctx: Context): ChannelSupport | null {
    const audienceSignal = this.find(ctx, 'audience', 'Primary Audience') ?? this.find(ctx, 'audience', 'Primary Use Case');
    const educationEvidence = [...this.keywordSignalsWithHints(ctx, ['informational']), ...(ctx.byCategory.get('pain') ?? []), ...(ctx.byCategory.get('jtbd') ?? [])];
    if (!audienceSignal || educationEvidence.length === 0) return null;

    return {
      channel: 'community',
      objectives: this.objectivesOf(ctx, ['education', 'awareness', 'consideration']),
      audienceSignal,
      keywordSignals: [],
      extraSignals: educationEvidence,
      reasons: [`Strong role/user audience evidence ("${audienceSignal.value}") with education/use-case evidence supports community-building.`],
      weaknesses: [],
    };
  }

  private evalPartnerships(ctx: Context): ChannelSupport | null {
    const businessModel = this.find(ctx, 'product', 'Business Model');
    const isB2BLike = !!businessModel && /b2b|marketplace|institution/i.test(businessModel.value);
    if (!isB2BLike || !businessModel) return null;

    return {
      channel: 'partnerships',
      objectives: this.objectivesOf(ctx, ['lead_generation', 'consideration']),
      extraSignals: [businessModel],
      keywordSignals: [],
      reasons: [`Business-model evidence ("${businessModel.value}") suggests a context where complementary partnerships are viable.`],
      weaknesses: [],
    };
  }

  private evalOutbound(ctx: Context): ChannelSupport | null {
    const icpSignal = this.find(ctx, 'audience', 'Ideal Customer Profile');
    const buyerSignal = this.find(ctx, 'commercial', 'Buyer Role');
    const objectives = this.objectivesOf(ctx, ['lead_generation']);
    if (!icpSignal || icpSignal.strengthScore < 65 || !buyerSignal || objectives.length === 0) return null;

    return {
      channel: 'outbound',
      objectives,
      audienceSignal: icpSignal,
      keywordSignals: [],
      extraSignals: [buyerSignal],
      reasons: [`A strong B2B ICP ("${icpSignal.value}") with identified buyer/decision-maker evidence supports outbound targeting.`],
      weaknesses: [],
    };
  }

  private evalProductLed(ctx: Context): ChannelSupport | null {
    const useCaseSignal = this.find(ctx, 'audience', 'Primary Use Case');
    const objectives = this.objectivesOf(ctx, ['activation']);
    if (!useCaseSignal || objectives.length === 0) return null;

    return {
      channel: 'product_led',
      objectives,
      useCaseSignal,
      keywordSignals: [],
      extraSignals: [],
      reasons: [`A strong self-service use case ("${useCaseSignal.value}") aligns with a product-led activation objective.`],
      weaknesses: [],
    };
  }

  // ---------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------

  private buildChannelFit(support: ChannelSupport): ChannelFit {
    const allSupporting = [
      ...(support.audienceSignal ? [support.audienceSignal] : []),
      ...support.keywordSignals,
      ...(support.useCaseSignal ? [support.useCaseSignal] : []),
      ...support.extraSignals,
    ];
    const distinctCategories = new Set(allSupporting.map((s) => s.category)).size;
    const evidenceBreadth = Math.min(100, distinctCategories * 25);

    // Only weight the dimensions this channel's rule actually populated —
    // a channel legitimately evidenced by (e.g.) buyer relationship alone
    // should not be penalized for lacking an unrelated audience/keyword
    // dimension; weights are renormalized over whichever dimensions apply.
    const dims: { weight: number; value: number }[] = [{ weight: 0.4, value: this.mean(support.objectives.map((o) => o.priorityScore)) }];
    if (support.audienceSignal) dims.push({ weight: 0.2, value: support.audienceSignal.strengthScore });
    if (support.keywordSignals.length > 0) dims.push({ weight: 0.2, value: this.mean(support.keywordSignals.map((s) => s.strengthScore)) });
    if (support.useCaseSignal) dims.push({ weight: 0.1, value: support.useCaseSignal.strengthScore });
    else if (support.audienceSignal) dims.push({ weight: 0.1, value: support.audienceSignal.strengthScore * 0.5 });
    dims.push({ weight: 0.1, value: evidenceBreadth });

    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    const fitScore = this.clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100);

    const signalConfidence = this.mean(allSupporting.map((s) => s.confidenceScore));
    const objectiveConfidence = this.mean(support.objectives.map((o) => o.confidenceScore));
    const confidenceScore = this.clamp(
      Math.round(signalConfidence * 0.6 + objectiveConfidence * 0.3 + Math.min(10, distinctCategories * 3)),
      0,
      100,
    );

    return {
      channel: support.channel,
      fitScore,
      confidenceScore,
      relatedObjectiveIds: this.dedupe(support.objectives.map((o) => o.id)),
      relatedAudienceSegmentIds: this.dedupe([
        ...(support.audienceSignal?.relatedSegmentIds ?? []),
        ...(support.useCaseSignal?.relatedSegmentIds ?? []),
        ...support.objectives.flatMap((o) => o.relatedAudienceSegmentIds),
      ]),
      relatedKeywords: this.dedupe([
        ...support.keywordSignals.flatMap((s) => s.relatedKeywords ?? []),
        ...support.objectives.flatMap((o) => o.relatedKeywords),
      ]),
      reasons: support.reasons,
      weaknesses: support.weaknesses,
      warnings: [],
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

  private getMinFitScore(): number {
    return this.getEnvNumber('GROWTH_CHANNEL_MIN_FIT_SCORE', DEFAULT_MIN_FIT_SCORE);
  }

  private getMaxChannels(): number {
    return this.getEnvNumber('GROWTH_CHANNEL_MAX_CHANNELS', DEFAULT_MAX_CHANNELS);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
