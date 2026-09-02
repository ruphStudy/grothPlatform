import { Injectable } from '@nestjs/common';
import type { ProductKnowledgeAssessment, ProductWebsiteKnowledgeBase } from './product-website-knowledge.types';

// Section weights for the overall confidence score. Identity + features
// dominate because pricing/FAQ/docs are legitimately absent on many
// perfectly-well-understood B2B SaaS sites.
const WEIGHTS = {
  identity: 0.3,
  features: 0.3,
  pricing: 0.15,
  faq: 0.1,
  documentation: 0.15,
};

const MAX_FAILURE_PENALTY = 15;
const ZERO_SUCCESS_PENALTY = 10;
const MAX_TOTAL_PENALTY = 25;

// Statements/features that carry no real product-understanding value even
// though they survived Sprint 8E extraction (bare nav labels, stray metrics).
const GENERIC_LOW_VALUE_TERMS = new Set([
  'product',
  'products',
  'platform',
  'solutions',
  'solution',
  'features',
  'feature',
  'home',
  'overview',
  'pricing',
  'about',
  'company',
  'learn more',
]);

const NUMERIC_METRIC_PATTERN = /^[$₹€£]?\s?\d[\d.,]*\s?(%|k|m|b|x|months?|years?|days?|weeks?|minutes?|hours?)?$/i;

const MIN_MEANINGFUL_FEATURE_LENGTH = 15;

@Injectable()
export class ProductKnowledgeAssessmentService {
  assess(knowledge: ProductWebsiteKnowledgeBase): ProductKnowledgeAssessment {
    const meaningfulIdentityStatements = knowledge.identity.keyStatements.filter((s) => !this.isLowValueStatement(s));
    const meaningfulFeatures = knowledge.features.filter((f) => this.isMeaningfulFeature(f));
    const answeredFaqs = knowledge.faqs.filter((f) => !!f.answer);

    const identityScore = this.scoreIdentity(knowledge, meaningfulIdentityStatements.length);
    const featuresScore = this.scoreFeatures(meaningfulFeatures.length);
    const pricingScore = this.scorePricing(knowledge.pricing.signals.length);
    const faqScore = this.scoreFaq(knowledge.faqs.length, answeredFaqs.length);
    const documentationScore = this.scoreDocumentation(
      knowledge.documentation.topics.length,
      knowledge.documentation.technicalFacts.length,
    );

    const baseScore =
      identityScore * WEIGHTS.identity +
      featuresScore * WEIGHTS.features +
      pricingScore * WEIGHTS.pricing +
      faqScore * WEIGHTS.faq +
      documentationScore * WEIGHTS.documentation;

    const penalty = this.computePenalty(knowledge);
    const confidenceScore = this.clamp(Math.round(baseScore - penalty), 0, 100);

    return {
      confidenceScore,
      coverage: {
        identity: identityScore,
        features: featuresScore,
        pricing: pricingScore,
        faq: faqScore,
        documentation: documentationScore,
      },
      missingInformation: this.buildMissingInformation(knowledge, identityScore, featuresScore),
      warnings: this.buildWarnings(knowledge, identityScore, featuresScore, meaningfulIdentityStatements.length),
      quality: this.qualityBand(confidenceScore),
    };
  }

  private scoreIdentity(knowledge: ProductWebsiteKnowledgeBase, meaningfulCount: number): number {
    const titlePoints = knowledge.identity.title ? 25 : 0;
    const metaPoints = knowledge.identity.metaDescription ? 15 : 0;
    const statementPoints = Math.min(100, Math.round((Math.min(meaningfulCount, 5) / 5) * 60));
    return this.clamp(titlePoints + metaPoints + statementPoints, 0, 100);
  }

  private scoreFeatures(meaningfulCount: number): number {
    return this.clamp(Math.round((Math.min(meaningfulCount, 8) / 8) * 100), 0, 100);
  }

  private scorePricing(signalCount: number): number {
    return this.clamp(Math.round((Math.min(signalCount, 6) / 6) * 100), 0, 100);
  }

  private scoreFaq(faqCount: number, answeredCount: number): number {
    if (faqCount === 0) return 0;
    const countPoints = (Math.min(faqCount, 5) / 5) * 60;
    const answerRatioPoints = (answeredCount / faqCount) * 40;
    return this.clamp(Math.round(countPoints + answerRatioPoints), 0, 100);
  }

  private scoreDocumentation(topicCount: number, factCount: number): number {
    const topicPoints = (Math.min(topicCount, 5) / 5) * 50;
    const factPoints = (Math.min(factCount, 5) / 5) * 50;
    return this.clamp(Math.round(topicPoints + factPoints), 0, 100);
  }

  private computePenalty(knowledge: ProductWebsiteKnowledgeBase): number {
    const { attemptedPages, failedPages, selectedPages, successfulPages } = knowledge.extractionStats;

    const failureRatio = attemptedPages > 0 ? failedPages / attemptedPages : 0;
    const failurePenalty = Math.round(Math.min(MAX_FAILURE_PENALTY, failureRatio * MAX_FAILURE_PENALTY));

    const zeroSuccessPenalty = selectedPages > 0 && successfulPages === 0 ? ZERO_SUCCESS_PENALTY : 0;

    return Math.min(MAX_TOTAL_PENALTY, failurePenalty + zeroSuccessPenalty);
  }

  private buildMissingInformation(
    knowledge: ProductWebsiteKnowledgeBase,
    identityScore: number,
    featuresScore: number,
  ): string[] {
    const items: string[] = [];
    if (identityScore < 30) {
      items.push('Clear product/company description was not found.');
    }
    if (featuresScore < 20) {
      items.push('Detailed product features or capabilities were not found.');
    }
    if (knowledge.pricing.signals.length === 0) {
      items.push('Pricing or packaging information was not found.');
    }
    if (knowledge.faqs.length === 0) {
      items.push('FAQ or common customer questions were not found.');
    }
    if (knowledge.documentation.topics.length === 0 && knowledge.documentation.technicalFacts.length === 0) {
      items.push('Documentation or technical usage information was not found.');
    }
    if (knowledge.extractionStats.successfulPages === 0) {
      items.push('No useful internal product pages were successfully analyzed.');
    }
    return items;
  }

  private buildWarnings(
    knowledge: ProductWebsiteKnowledgeBase,
    identityScore: number,
    featuresScore: number,
    meaningfulIdentityCount: number,
  ): string[] {
    const warnings: string[] = [];
    const { successfulPages, failedPages } = knowledge.extractionStats;

    if (successfulPages === 0) {
      warnings.push('Website knowledge is based primarily on the homepage.');
    } else if (failedPages > 0) {
      warnings.push('Some selected website pages could not be analyzed.');
    }

    if (successfulPages === 0 && identityScore < 30 && featuresScore < 20) {
      warnings.push('Website content appears sparse.');
    }

    if (knowledge.identity.keyStatements.length > 0 && meaningfulIdentityCount === 0) {
      warnings.push('Identity evidence contains mostly generic headings.');
    }

    if (knowledge.combinedTextTruncated) {
      warnings.push('Combined website knowledge was truncated.');
    }

    return warnings;
  }

  private qualityBand(score: number): 'high' | 'medium' | 'low' {
    if (score >= 80) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  }

  private isLowValueStatement(text: string): boolean {
    const normalized = text.trim();
    if (!normalized) return true;
    if (NUMERIC_METRIC_PATTERN.test(normalized)) return true;
    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length === 1 && GENERIC_LOW_VALUE_TERMS.has(normalized.toLowerCase())) return true;
    if (words.length === 1 && normalized.length < 4) return true;
    return false;
  }

  private isMeaningfulFeature(text: string): boolean {
    const normalized = text.trim();
    if (!normalized) return false;
    if (GENERIC_LOW_VALUE_TERMS.has(normalized.toLowerCase())) return false;
    return normalized.length >= MIN_MEANINGFUL_FEATURE_LENGTH;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
