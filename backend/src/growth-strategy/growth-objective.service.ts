import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { StrategySignal, StrategySignalResult } from './types/strategy-signal.types';
import type { GrowthObjective, GrowthObjectiveResult, GrowthObjectiveType } from './types/growth-objective.types';

const DEFAULT_PRIMARY_MIN_SCORE = 60;
const DEFAULT_MAX_OBJECTIVES = 6;

type IntentHint = 'informational' | 'commercial' | 'transactional' | 'comparison' | 'problem';

const OBJECTIVE_TITLES: Record<GrowthObjectiveType, string> = {
  awareness: 'Increase Qualified Awareness',
  education: 'Educate Target Audiences',
  consideration: 'Drive Product Consideration',
  lead_generation: 'Generate Qualified Leads',
  conversion: 'Improve Trial/Signup Conversion',
  positioning: 'Strengthen Category Positioning',
  differentiation: 'Differentiate From Competitors',
  buyer_enablement: 'Support Buyer Evaluation',
  retention: 'Improve Retention',
  activation: 'Drive Product Activation',
};

const DISCLAIMER =
  'Growth objectives are evidence-based hypotheses and should be validated against actual business goals and performance data.';

interface RawObjective {
  type: GrowthObjectiveType;
  supporting: StrategySignal[];
  reasons: string[];
}

interface Context {
  byCategory: Map<string, StrategySignal[]>;
  keywordHints: Map<string, Set<IntentHint>>; // keyed by signal.id
}

@Injectable()
export class GrowthObjectiveService {
  constructor(private readonly configService: ConfigService) {}

  detect(strategySignals: StrategySignalResult): GrowthObjectiveResult {
    const ctx = this.buildContext(strategySignals);

    const raw = [
      this.detectAwareness(ctx),
      this.detectEducation(ctx),
      this.detectConsideration(ctx),
      this.detectLeadGeneration(ctx),
      this.detectConversion(ctx),
      this.detectPositioning(ctx),
      this.detectDifferentiation(ctx),
      this.detectBuyerEnablement(ctx),
      this.detectActivation(ctx),
      this.detectRetention(ctx),
    ].filter((o): o is RawObjective => o !== null);

    const objectives = raw
      .map((r) => this.buildObjective(r))
      .sort((a, b) => b.priorityScore - a.priorityScore || b.confidenceScore - a.confidenceScore || a.id.localeCompare(b.id))
      .slice(0, this.getMaxObjectives());

    const top = objectives[0];
    const primaryObjectiveId = top && top.priorityScore >= this.getPrimaryMinScore() ? top.id : undefined;
    const secondaryObjectiveIds = objectives.filter((o) => o.id !== primaryObjectiveId).map((o) => o.id);

    const confidenceScore = objectives.length
      ? Math.round(objectives.reduce((sum, o) => sum + o.confidenceScore, 0) / objectives.length)
      : 0;

    return {
      objectives,
      primaryObjectiveId,
      secondaryObjectiveIds,
      confidenceScore,
      warnings: [DISCLAIMER],
      generatedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------
  // Context
  // ---------------------------------------------------------------------

  private buildContext(strategySignals: StrategySignalResult): Context {
    const byCategory = new Map<string, StrategySignal[]>();
    for (const s of strategySignals.signals) {
      const list = byCategory.get(s.category) ?? [];
      list.push(s);
      byCategory.set(s.category, list);
    }

    const keywordHints = new Map<string, Set<IntentHint>>();
    for (const s of byCategory.get('keyword') ?? []) {
      keywordHints.set(s.id, this.inferKeywordIntentHints(s.value));
    }

    return { byCategory, keywordHints };
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

  private keywordSignalsWithHint(ctx: Context, hint: IntentHint): StrategySignal[] {
    return (ctx.byCategory.get('keyword') ?? []).filter((s) => ctx.keywordHints.get(s.id)?.has(hint));
  }

  private find(ctx: Context, category: string, title: string): StrategySignal | undefined {
    return (ctx.byCategory.get(category) ?? []).find((s) => s.title === title);
  }

  // ---------------------------------------------------------------------
  // Rules
  // ---------------------------------------------------------------------

  private detectAwareness(ctx: Context): RawObjective | null {
    const categorySignal = this.find(ctx, 'product', 'Product Category');
    const informational = this.keywordSignalsWithHint(ctx, 'informational');
    const problemKeywords = this.keywordSignalsWithHint(ctx, 'problem');
    const pain = ctx.byCategory.get('pain') ?? [];
    const supportingProblem = [...informational, ...problemKeywords, ...pain];
    if (!categorySignal || supportingProblem.length === 0) return null;

    return {
      type: 'awareness',
      supporting: [categorySignal, ...supportingProblem.slice(0, 2)],
      reasons: [`Product category ("${categorySignal.value}") is established but informational/problem-stage keyword demand suggests room to build awareness.`],
    };
  }

  private detectEducation(ctx: Context): RawObjective | null {
    const painJtbd = [...(ctx.byCategory.get('pain') ?? []), ...(ctx.byCategory.get('jtbd') ?? [])];
    const informational = this.keywordSignalsWithHint(ctx, 'informational');
    if (painJtbd.length === 0 || informational.length === 0) return null;

    return {
      type: 'education',
      supporting: [...painJtbd.slice(0, 2), ...informational.slice(0, 2)],
      reasons: ['Audience pain/job-to-be-done evidence combined with informational keyword demand supports educational content.'],
    };
  }

  private detectConsideration(ctx: Context): RawObjective | null {
    const commercial = this.keywordSignalsWithHint(ctx, 'commercial');
    const fitSignal = this.find(ctx, 'audience', 'Ideal Customer Profile') ?? this.find(ctx, 'audience', 'Primary Use Case');
    if (commercial.length === 0 || !fitSignal) return null;

    return {
      type: 'consideration',
      supporting: [fitSignal, ...commercial.slice(0, 2)],
      reasons: [`Solution/commercial keyword demand aligns with established product-audience fit ("${fitSignal.value}").`],
    };
  }

  private detectLeadGeneration(ctx: Context): RawObjective | null {
    const buyer = this.find(ctx, 'commercial', 'Buyer Role');
    const commercial = this.keywordSignalsWithHint(ctx, 'commercial');
    if (!buyer || commercial.length === 0) return null;

    return {
      type: 'lead_generation',
      supporting: [buyer, ...commercial.slice(0, 2)],
      reasons: [`A distinct buyer role ("${buyer.value}") combined with commercial keyword demand supports a lead-generation objective.`],
    };
  }

  private detectConversion(ctx: Context): RawObjective | null {
    const transactional = this.keywordSignalsWithHint(ctx, 'transactional');
    const fitSignal = this.find(ctx, 'audience', 'Ideal Customer Profile') ?? this.find(ctx, 'audience', 'Primary Use Case');
    if (transactional.length === 0 || !fitSignal) return null;

    return {
      type: 'conversion',
      supporting: [fitSignal, ...transactional.slice(0, 2)],
      reasons: ['Transactional keyword demand with a clear product/use-case fit supports a conversion objective.'],
    };
  }

  private detectPositioning(ctx: Context): RawObjective | null {
    const valueProp = this.find(ctx, 'positioning', 'Value Proposition') ?? this.find(ctx, 'positioning', 'Suggested Positioning');
    const positioningOpp = this.find(ctx, 'market', 'Positioning Opportunity');
    const strongCategory = ctx.byCategory.get('product')?.find((s) => s.title === 'Product Category' && s.strengthScore >= 65);
    const supporting = [valueProp, positioningOpp, strongCategory].filter((s): s is StrategySignal => !!s);
    if (supporting.length === 0) return null;

    return {
      type: 'positioning',
      supporting,
      reasons: ['Strong positioning/category evidence supports a category-positioning objective.'],
    };
  }

  private detectDifferentiation(ctx: Context): RawObjective | null {
    const differentiation = ctx.byCategory.get('differentiation') ?? [];
    const coverageGap = (ctx.byCategory.get('competitor') ?? []).filter((s) => s.title === 'Competitive Coverage Gap');
    const supporting = [...differentiation, ...coverageGap];
    if (supporting.length === 0) return null;

    return {
      type: 'differentiation',
      supporting: supporting.slice(0, 3),
      reasons: ['Differentiation and/or competitor coverage-gap evidence supports a differentiation objective.'],
    };
  }

  private detectBuyerEnablement(ctx: Context): RawObjective | null {
    const buyer = this.find(ctx, 'commercial', 'Buyer Role');
    const comparison = this.keywordSignalsWithHint(ctx, 'comparison');
    if (!buyer || comparison.length === 0) return null;

    return {
      type: 'buyer_enablement',
      supporting: [buyer, ...comparison.slice(0, 2)],
      reasons: [`Buyer-role evidence ("${buyer.value}") combined with comparison-stage keyword demand supports enabling buyer evaluation.`],
    };
  }

  private detectActivation(ctx: Context): RawObjective | null {
    const useCase = this.find(ctx, 'audience', 'Primary Use Case');
    const jtbd = ctx.byCategory.get('jtbd') ?? [];
    if (!useCase || jtbd.length === 0) return null;

    return {
      type: 'activation',
      supporting: [useCase, ...jtbd.slice(0, 1)],
      reasons: [`A clear primary use case ("${useCase.value}") with job-to-be-done evidence supports driving product activation.`],
    };
  }

  private detectRetention(_ctx: Context): RawObjective | null {
    // No lifecycle/repeat-usage evidence is currently exposed by 12A
    // strategy signals — never invent retention from generic usage.
    return null;
  }

  // ---------------------------------------------------------------------
  // Scoring / assembly
  // ---------------------------------------------------------------------

  private buildObjective(raw: RawObjective): GrowthObjective {
    const strengths = raw.supporting.map((s) => s.strengthScore);
    const avgStrength = strengths.reduce((a, b) => a + b, 0) / strengths.length;
    const maxStrength = Math.max(...strengths);
    const countBonus = Math.min(15, (raw.supporting.length - 1) * 7);
    const priorityScore = this.clamp(Math.round(avgStrength * 0.6 + maxStrength * 0.3 + countBonus), 0, 100);

    const avgConfidence = raw.supporting.reduce((sum, s) => sum + s.confidenceScore, 0) / raw.supporting.length;
    const distinctCategories = new Set(raw.supporting.map((s) => s.category)).size;
    const confidenceScore = this.clamp(Math.round(avgConfidence * 0.7 + Math.min(20, distinctCategories * 8)), 0, 100);

    const missingEvidence: string[] = [];
    if (raw.supporting.length < 2) missingEvidence.push('Based on limited supporting evidence; validate before prioritizing.');

    return {
      id: raw.type.replace(/_/g, '-'),
      type: raw.type,
      title: OBJECTIVE_TITLES[raw.type],
      priorityScore,
      confidenceScore,
      relatedSignalIds: this.dedupe(raw.supporting.map((s) => s.id)),
      relatedAudienceSegmentIds: this.dedupe(raw.supporting.flatMap((s) => s.relatedSegmentIds ?? [])),
      relatedKeywords: this.dedupe(raw.supporting.flatMap((s) => s.relatedKeywords ?? [])),
      reasons: raw.reasons,
      missingEvidence,
      warnings: [],
    };
  }

  private dedupe(items: string[]): string[] {
    return Array.from(new Set(items.filter((i) => i && i.trim())));
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private getPrimaryMinScore(): number {
    return this.getEnvNumber('GROWTH_OBJECTIVE_PRIMARY_MIN_SCORE', DEFAULT_PRIMARY_MIN_SCORE);
  }

  private getMaxObjectives(): number {
    return this.getEnvNumber('GROWTH_OBJECTIVE_MAX_OBJECTIVES', DEFAULT_MAX_OBJECTIVES);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
