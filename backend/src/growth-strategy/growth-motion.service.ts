import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ChannelFit, GrowthChannel, GrowthChannelFitResult } from './types/growth-channel-fit.types';
import type { GrowthMotion, GrowthMotionResult, GrowthMotionType } from './types/growth-motion.types';
import type { GrowthObjective, GrowthObjectiveResult, GrowthObjectiveType } from './types/growth-objective.types';
import type { StrategySignal, StrategySignalResult } from './types/strategy-signal.types';

const DEFAULT_MIN_FIT_SCORE = 50;
const DEFAULT_HYBRID_DELTA = 8;
const DEFAULT_MAX_MOTIONS = 4;

const DISCLAIMER =
  'Growth motions are evidence-based strategy patterns and should be validated against real acquisition and conversion performance.';

export interface GrowthMotionInput {
  signals: StrategySignalResult;
  objectives: GrowthObjectiveResult;
  channels: GrowthChannelFitResult;
}

interface RawMotion {
  type: GrowthMotionType;
  channels: ChannelFit[];
  objectives: GrowthObjective[];
  signals: StrategySignal[];
  reasons: string[];
}

interface Context {
  byCategory: Map<string, StrategySignal[]>;
  channelByName: Map<GrowthChannel, ChannelFit>;
  objectiveByType: Map<GrowthObjectiveType, GrowthObjective>;
}

@Injectable()
export class GrowthMotionService {
  constructor(private readonly configService: ConfigService) {}

  detect(input: GrowthMotionInput): GrowthMotionResult {
    const ctx = this.buildContext(input);

    const raw = [
      this.detectSeoLed(ctx),
      this.detectContentLed(ctx),
      this.detectProductLed(ctx),
      this.detectSalesLed(ctx),
      this.detectCommunityLed(ctx),
      this.detectPartnershipLed(ctx),
      this.detectPaidAcquisitionLed(ctx),
    ].filter((r): r is RawMotion => r !== null);

    const minFit = this.getMinFitScore();
    const qualifying = raw
      .map((r) => this.buildMotion(r))
      .filter((m) => m.fitScore >= minFit)
      .sort((a, b) => b.fitScore - a.fitScore || b.confidenceScore - a.confidenceScore || a.type.localeCompare(b.type));

    const motions = [...qualifying];
    if (qualifying.length >= 2) {
      const [top1, top2] = qualifying;
      if (Math.abs(top1.fitScore - top2.fitScore) <= this.getHybridDelta()) {
        motions.push(this.buildHybrid(top1, top2));
      }
    }

    motions.sort((a, b) => b.fitScore - a.fitScore || b.confidenceScore - a.confidenceScore || a.type.localeCompare(b.type));
    const bounded = motions.slice(0, this.getMaxMotions());

    const top = bounded[0];
    const primaryMotion = top && top.fitScore >= minFit ? top.type : undefined;
    const secondaryMotions = bounded.filter((m) => m.type !== primaryMotion).map((m) => m.type);

    const confidenceScore = bounded.length
      ? Math.round(bounded.reduce((sum, m) => sum + m.confidenceScore, 0) / bounded.length)
      : 0;

    return {
      motions: bounded,
      primaryMotion,
      secondaryMotions,
      confidenceScore,
      warnings: [DISCLAIMER],
      generatedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------
  // Context
  // ---------------------------------------------------------------------

  private buildContext(input: GrowthMotionInput): Context {
    const byCategory = new Map<string, StrategySignal[]>();
    for (const s of input.signals.signals) {
      const list = byCategory.get(s.category) ?? [];
      list.push(s);
      byCategory.set(s.category, list);
    }
    const channelByName = new Map(input.channels.channels.map((c) => [c.channel, c]));
    const objectiveByType = new Map(input.objectives.objectives.map((o) => [o.type, o]));
    return { byCategory, channelByName, objectiveByType };
  }

  private find(ctx: Context, category: string, title: string): StrategySignal | undefined {
    return (ctx.byCategory.get(category) ?? []).find((s) => s.title === title);
  }

  private objectivesOf(ctx: Context, types: GrowthObjectiveType[]): GrowthObjective[] {
    return types.map((t) => ctx.objectiveByType.get(t)).filter((o): o is GrowthObjective => !!o);
  }

  private channelsOf(ctx: Context, names: GrowthChannel[]): ChannelFit[] {
    return names.map((n) => ctx.channelByName.get(n)).filter((c): c is ChannelFit => !!c);
  }

  // ---------------------------------------------------------------------
  // Motion rules
  // ---------------------------------------------------------------------

  private detectSeoLed(ctx: Context): RawMotion | null {
    const seo = ctx.channelByName.get('seo');
    const objectives = this.objectivesOf(ctx, ['awareness', 'education', 'consideration']);
    const keywordSignals = ctx.byCategory.get('keyword') ?? [];
    if (!seo || objectives.length === 0 || keywordSignals.length === 0) return null;

    return {
      type: 'seo_led',
      channels: [seo],
      objectives,
      signals: keywordSignals.slice(0, 3),
      reasons: ['Strong SEO channel fit with awareness/education/consideration objectives and keyword evidence.'],
    };
  }

  private detectContentLed(ctx: Context): RawMotion | null {
    const content = ctx.channelByName.get('content');
    const painJtbd = [...(ctx.byCategory.get('pain') ?? []), ...(ctx.byCategory.get('jtbd') ?? [])];
    const educationObjective = ctx.objectiveByType.get('education');
    if (!content || (painJtbd.length === 0 && !educationObjective)) return null;

    return {
      type: 'content_led',
      channels: [content],
      objectives: educationObjective ? [educationObjective] : [],
      signals: painJtbd.slice(0, 3),
      reasons: ['Strong content channel fit with pain/job-to-be-done or education evidence.'],
    };
  }

  private detectProductLed(ctx: Context): RawMotion | null {
    const productLed = ctx.channelByName.get('product_led');
    const activation = ctx.objectiveByType.get('activation');
    const useCaseSignal = this.find(ctx, 'audience', 'Primary Use Case');
    if (!productLed || !activation) return null;

    return {
      type: 'product_led',
      channels: [productLed],
      objectives: [activation],
      signals: useCaseSignal ? [useCaseSignal] : [],
      reasons: ['Strong product-led channel fit with a self-service activation objective.'],
    };
  }

  private detectSalesLed(ctx: Context): RawMotion | null {
    const salesChannels = this.channelsOf(ctx, ['outbound', 'email', 'paid_search']);
    const icpSignal = this.find(ctx, 'audience', 'Ideal Customer Profile');
    const buyerSignal = this.find(ctx, 'commercial', 'Buyer Role');
    const objectives = this.objectivesOf(ctx, ['lead_generation', 'buyer_enablement']);
    if (salesChannels.length === 0 || !icpSignal || !buyerSignal || objectives.length === 0) return null;

    return {
      type: 'sales_led',
      channels: salesChannels,
      objectives,
      signals: [icpSignal, buyerSignal],
      reasons: ['B2B ICP and buyer evidence combined with outbound/email/paid-search channel fit and lead-gen/buyer-enablement objectives.'],
    };
  }

  private detectCommunityLed(ctx: Context): RawMotion | null {
    const community = ctx.channelByName.get('community');
    const audienceSignal = this.find(ctx, 'audience', 'Primary Audience') ?? this.find(ctx, 'audience', 'Primary Use Case');
    if (!community || !audienceSignal) return null;

    return {
      type: 'community_led',
      channels: [community],
      objectives: this.objectivesOf(ctx, ['education', 'awareness', 'consideration']),
      signals: [audienceSignal],
      reasons: [`Strong community channel fit with clear role/user audience evidence ("${audienceSignal.value}").`],
    };
  }

  private detectPartnershipLed(ctx: Context): RawMotion | null {
    const partnerships = ctx.channelByName.get('partnerships');
    const businessModel = this.find(ctx, 'product', 'Business Model');
    const isB2BLike = !!businessModel && /b2b|marketplace|institution/i.test(businessModel.value);
    if (!partnerships || !isB2BLike || !businessModel) return null;

    return {
      type: 'partnership_led',
      channels: [partnerships],
      objectives: this.objectivesOf(ctx, ['lead_generation', 'consideration']),
      signals: [businessModel],
      reasons: [`Strong partnerships channel fit with B2B/institution/marketplace relationship evidence ("${businessModel.value}").`],
    };
  }

  private detectPaidAcquisitionLed(ctx: Context): RawMotion | null {
    const paidChannels = this.channelsOf(ctx, ['paid_search', 'paid_social']);
    const objectives = this.objectivesOf(ctx, ['conversion', 'lead_generation']);
    if (paidChannels.length === 0 || objectives.length === 0) return null;

    return {
      type: 'paid_acquisition_led',
      channels: paidChannels,
      objectives,
      signals: [],
      reasons: ['Strong paid search/social channel fit with a conversion or lead-generation objective.'],
    };
  }

  // ---------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------

  private buildMotion(raw: RawMotion): GrowthMotion {
    const channelFit = this.mean(raw.channels.map((c) => c.fitScore));
    const objectiveAlignment = raw.objectives.length ? this.mean(raw.objectives.map((o) => o.priorityScore)) : 0;

    const categoryTags = new Set<string>(['channel']);
    if (raw.objectives.length > 0) categoryTags.add('objective');
    for (const s of raw.signals) categoryTags.add(s.category);
    const evidenceBreadth = Math.min(100, categoryTags.size * 20);

    const dims: { weight: number; value: number }[] = [
      { weight: 0.5, value: channelFit },
      { weight: 0.25, value: objectiveAlignment },
    ];
    if (raw.signals.length > 0) dims.push({ weight: 0.15, value: this.mean(raw.signals.map((s) => s.strengthScore)) });
    dims.push({ weight: 0.1, value: evidenceBreadth });
    const totalWeight = dims.reduce((sum, d) => sum + d.weight, 0);
    const fitScore = this.clamp(Math.round(dims.reduce((sum, d) => sum + d.weight * d.value, 0) / totalWeight), 0, 100);

    const channelConfidence = this.mean(raw.channels.map((c) => c.confidenceScore));
    const objectiveConfidence = raw.objectives.length ? this.mean(raw.objectives.map((o) => o.confidenceScore)) : 0;
    const signalConfidence = raw.signals.length ? this.mean(raw.signals.map((s) => s.confidenceScore)) : 0;
    const confidenceScore = this.clamp(
      Math.round(channelConfidence * 0.4 + objectiveConfidence * 0.3 + signalConfidence * 0.2 + Math.min(10, categoryTags.size * 3)),
      0,
      100,
    );

    return {
      type: raw.type,
      fitScore,
      confidenceScore,
      supportingChannelIds: this.dedupe(raw.channels.map((c) => c.channel)),
      supportingObjectiveIds: this.dedupe(raw.objectives.map((o) => o.id)),
      reasons: raw.reasons,
      weaknesses: [],
      warnings: [],
    };
  }

  private buildHybrid(a: GrowthMotion, b: GrowthMotion): GrowthMotion {
    const diff = Math.abs(a.fitScore - b.fitScore);
    return {
      type: 'hybrid',
      fitScore: Math.round((a.fitScore + b.fitScore) / 2),
      confidenceScore: Math.round((a.confidenceScore + b.confidenceScore) / 2),
      supportingChannelIds: this.dedupe([...a.supportingChannelIds, ...b.supportingChannelIds]),
      supportingObjectiveIds: this.dedupe([...a.supportingObjectiveIds, ...b.supportingObjectiveIds]),
      reasons: [`Evidence for ${a.type} and ${b.type} is similarly strong (score difference ${diff}); no single motion clearly dominates.`],
      weaknesses: [],
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
    return this.getEnvNumber('GROWTH_MOTION_MIN_FIT_SCORE', DEFAULT_MIN_FIT_SCORE);
  }

  private getHybridDelta(): number {
    return this.getEnvNumber('GROWTH_MOTION_HYBRID_DELTA', DEFAULT_HYBRID_DELTA);
  }

  private getMaxMotions(): number {
    return this.getEnvNumber('GROWTH_MOTION_MAX_MOTIONS', DEFAULT_MAX_MOTIONS);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
