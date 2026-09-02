import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebsiteContentExtractorService } from './website-content-extractor.service';
import type { WebsiteExtractedContent } from './website-content.types';
import { WebsiteCorePageExtractionService } from './website-core-page-extraction.service';
import { WebsiteFetchService } from './website-fetch.service';
import { WebsitePageDiscoveryService } from './website-page-discovery.service';
import { WebsitePageSelectionService } from './website-page-selection.service';
import type { WebsiteFaqItem, WebsitePageKnowledge } from './website-page-knowledge.types';
import { WebsiteSupportPageExtractionService } from './website-support-page-extraction.service';
import type { ProductWebsiteKnowledge, ProductWebsiteKnowledgeBase, ProductWebsitePageRef } from './product-website-knowledge.types';
import { ProductKnowledgeAssessmentService } from './product-knowledge-assessment.service';

const DEFAULT_MAX_IDENTITY_STATEMENTS = 30;
const DEFAULT_MAX_FEATURES = 50;
const DEFAULT_MAX_PRICING_SIGNALS = 40;
const DEFAULT_MAX_FAQS = 50;
const DEFAULT_MAX_DOC_TOPICS = 50;
const DEFAULT_MAX_TECH_FACTS = 60;
const DEFAULT_MAX_CTAS = 30;
const DEFAULT_MAX_COMBINED_CHARS = 30000;
const HOMEPAGE_TEXT_PREVIEW_CHARS = 1500;

// Local, small heuristics for homepage-only text (about/product/features
// pages already computed equivalent signals in Sprint 8C via their own
// services — these mirror that intent just for homepage paragraphs/list
// items, which no existing service otherwise inspects for this purpose).
const IDENTITY_KEYWORDS =
  /\b(we|our|mission|vision|believe|founded|help|empower|provide|serve|customers?|users?|built|designed|company|team)\b/i;
const FEATURE_KEYWORDS = /\b(feature|capabilit|platform|automat|manage|monitor|build|create|integrat|analyz|secure|support)\w*/i;
const PRICING_PATTERN =
  /[$₹€£]\s?\d|per\s?month|\/month|per\s?year|\/year|monthly|annually|\bannual\b|free\s?trial|\bfree\b|\btrial\b|\bstarter\b|\bbasic\b|\bpro\b|\bprofessional\b|\bbusiness\b|\benterprise\b|contact\s?sales|custom\s?pricing/i;

const CTA_NOISE_TERMS = new Set(['skip to content', 'toggle menu', 'previous', 'next', 'copy']);

@Injectable()
export class ProductWebsiteKnowledgeService {
  constructor(
    private readonly configService: ConfigService,
    private readonly websiteFetchService: WebsiteFetchService,
    private readonly websiteContentExtractorService: WebsiteContentExtractorService,
    private readonly websitePageDiscoveryService: WebsitePageDiscoveryService,
    private readonly websitePageSelectionService: WebsitePageSelectionService,
    private readonly websiteCorePageExtractionService: WebsiteCorePageExtractionService,
    private readonly websiteSupportPageExtractionService: WebsiteSupportPageExtractionService,
    private readonly productKnowledgeAssessmentService: ProductKnowledgeAssessmentService,
  ) {}

  async buildKnowledge(homepageUrl: string): Promise<ProductWebsiteKnowledge> {
    // Homepage fetched exactly once; discovery/selection also run exactly
    // once, and the resulting selected pages are handed to both extraction
    // services' extractSelectedPages() (not extractFromHomepage()), which
    // fetch only the child pages they need — no re-fetch of the homepage.
    const homepageFetchResult = await this.websiteFetchService.fetchWebsite(homepageUrl);
    const homepageExtracted = this.websiteContentExtractorService.extract(homepageFetchResult);
    const discovered = this.websitePageDiscoveryService.discoverPages(homepageFetchResult);
    const selected = this.websitePageSelectionService.selectImportantPages(discovered);

    const [coreResult, supportResult] = await Promise.all([
      this.websiteCorePageExtractionService.extractSelectedPages(selected),
      this.websiteSupportPageExtractionService.extractSelectedPages(selected),
    ]);

    const allPages = [...coreResult.pages, ...supportResult.pages];
    const failures = [...coreResult.failures, ...supportResult.failures];

    const pagesAnalyzed: ProductWebsitePageRef[] = [
      { url: homepageFetchResult.finalUrl, category: 'homepage', fetchedAt: homepageExtracted.fetchedAt },
      ...allPages.map((p) => ({ url: p.url, category: p.category, fetchedAt: p.fetchedAt })),
    ];

    const identity = this.buildIdentity(homepageExtracted, allPages);
    const features = this.buildFeatures(homepageExtracted, allPages);
    const pricingSignals = this.buildPricingSignals(homepageExtracted, allPages);
    const faqs = this.buildFaqs(allPages);
    const documentation = this.buildDocumentation(allPages);
    const callsToAction = this.buildCtas(homepageExtracted, allPages);

    const { combinedText, truncated } = this.buildCombinedText(
      homepageExtracted,
      identity,
      features,
      pricingSignals,
      faqs,
      documentation,
    );

    const base: ProductWebsiteKnowledgeBase = {
      source: {
        configuredUrl: homepageUrl,
        finalHomepageUrl: homepageFetchResult.finalUrl,
        homepageFetchedAt: homepageExtracted.fetchedAt,
      },
      pagesAnalyzed,
      identity,
      features,
      pricing: { signals: pricingSignals },
      faqs,
      documentation,
      callsToAction,
      combinedText,
      combinedTextTruncated: truncated,
      extractionStats: {
        discoveredPages: discovered.length,
        selectedPages: selected.length,
        attemptedPages: allPages.length + failures.length,
        successfulPages: allPages.length,
        failedPages: failures.length,
      },
      failures,
    };

    const assessment = this.productKnowledgeAssessmentService.assess(base);
    return { ...base, assessment };
  }

  private buildIdentity(
    homepage: WebsiteExtractedContent,
    pages: WebsitePageKnowledge[],
  ): { title?: string; metaDescription?: string; keyStatements: string[] } {
    const homepageStatements = [...homepage.paragraphs, ...homepage.listItems].filter((t) => IDENTITY_KEYWORDS.test(t));

    const aboutStatements = pages.filter((p) => p.category === 'about').flatMap((p) => p.keyStatements);
    const productStatements = pages.filter((p) => p.category === 'product').flatMap((p) => p.headings);

    const combined = this.dedupe([...homepageStatements, ...aboutStatements, ...productStatements]).slice(
      0,
      this.getMaxIdentityStatements(),
    );

    return {
      title: homepage.title,
      metaDescription: homepage.metaDescription,
      keyStatements: combined,
    };
  }

  private buildFeatures(homepage: WebsiteExtractedContent, pages: WebsitePageKnowledge[]): string[] {
    const pageFeatures = pages
      .filter((p) => p.category === 'product' || p.category === 'features')
      .flatMap((p) => p.featureItems);

    const homepageFeatureLike = [...homepage.listItems, ...homepage.headings.h2, ...homepage.headings.h3].filter((t) =>
      FEATURE_KEYWORDS.test(t),
    );

    return this.dedupe([...pageFeatures, ...homepageFeatureLike]).slice(0, this.getMaxFeatures());
  }

  private buildPricingSignals(homepage: WebsiteExtractedContent, pages: WebsitePageKnowledge[]): string[] {
    const pagePricing = pages.filter((p) => p.category === 'pricing').flatMap((p) => p.pricingSignals);

    const homepagePricingLike = [...homepage.paragraphs, ...homepage.listItems, ...homepage.headings.h2, ...homepage.headings.h3].filter(
      (t) => PRICING_PATTERN.test(t),
    );

    return this.dedupe([...pagePricing, ...homepagePricingLike]).slice(0, this.getMaxPricingSignals());
  }

  private buildFaqs(pages: WebsitePageKnowledge[]): WebsiteFaqItem[] {
    const allItems = pages.filter((p) => p.category === 'faq').flatMap((p) => p.faqItems);

    const byQuestion = new Map<string, WebsiteFaqItem>();
    for (const item of allItems) {
      const question = this.normalize(item.question);
      if (!question) continue;
      const key = question.toLowerCase();
      const answer = item.answer ? this.normalize(item.answer) : undefined;
      const existing = byQuestion.get(key);

      if (!existing) {
        byQuestion.set(key, answer ? { question, answer } : { question });
        continue;
      }
      if (!existing.answer && answer) {
        byQuestion.set(key, { question: existing.question, answer });
      } else if (existing.answer && answer && answer.length > existing.answer.length) {
        byQuestion.set(key, { question: existing.question, answer });
      }
    }

    return Array.from(byQuestion.values()).slice(0, this.getMaxFaqs());
  }

  private buildDocumentation(pages: WebsitePageKnowledge[]): { topics: string[]; technicalFacts: string[] } {
    const docPages = pages.filter((p) => p.category === 'docs');
    const topics = this.dedupe(docPages.flatMap((p) => p.docTopics)).slice(0, this.getMaxDocTopics());
    const technicalFacts = this.dedupe(docPages.flatMap((p) => p.technicalFacts)).slice(0, this.getMaxTechFacts());
    return { topics, technicalFacts };
  }

  private buildCtas(homepage: WebsiteExtractedContent, pages: WebsitePageKnowledge[]): string[] {
    const all = [...homepage.ctas, ...pages.flatMap((p) => p.ctas)];
    const filtered = all.filter((t) => !CTA_NOISE_TERMS.has(t.trim().toLowerCase()));
    return this.dedupe(filtered).slice(0, this.getMaxCtas());
  }

  private buildCombinedText(
    homepage: WebsiteExtractedContent,
    identity: { title?: string; metaDescription?: string; keyStatements: string[] },
    features: string[],
    pricingSignals: string[],
    faqs: WebsiteFaqItem[],
    documentation: { topics: string[]; technicalFacts: string[] },
  ): { combinedText: string; truncated: boolean } {
    const sections: string[] = [];

    const homepageLines = this.dedupe(
      [homepage.title, homepage.metaDescription, ...homepage.headings.h1, ...homepage.headings.h2]
        .filter((v): v is string => Boolean(v))
        .concat(homepage.textContent.slice(0, HOMEPAGE_TEXT_PREVIEW_CHARS)),
    );
    sections.push(`[HOMEPAGE]\n${homepageLines.join('\n')}`);

    if (identity.keyStatements.length > 0) {
      sections.push(`[IDENTITY]\n${identity.keyStatements.join('\n')}`);
    }
    if (features.length > 0) {
      sections.push(`[FEATURES]\n${features.join('\n')}`);
    }
    if (pricingSignals.length > 0) {
      sections.push(`[PRICING]\n${pricingSignals.join('\n')}`);
    }
    if (faqs.length > 0) {
      const faqLines = faqs.map((f) => (f.answer ? `Q: ${f.question}\nA: ${f.answer}` : `Q: ${f.question}`));
      sections.push(`[FAQ]\n${faqLines.join('\n')}`);
    }
    if (documentation.topics.length > 0 || documentation.technicalFacts.length > 0) {
      sections.push(`[DOCUMENTATION]\n${[...documentation.topics, ...documentation.technicalFacts].join('\n')}`);
    }

    const combined = sections.join('\n\n');
    const maxChars = this.getMaxCombinedChars();
    if (combined.length <= maxChars) {
      return { combinedText: combined, truncated: false };
    }
    return { combinedText: combined.slice(0, maxChars), truncated: true };
  }

  private normalize(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  private dedupe(items: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of items) {
      const normalized = this.normalize(raw);
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(normalized);
    }
    return result;
  }

  private getMaxIdentityStatements(): number {
    return this.getEnvNumber('PRODUCT_KNOWLEDGE_MAX_IDENTITY_STATEMENTS', DEFAULT_MAX_IDENTITY_STATEMENTS);
  }

  private getMaxFeatures(): number {
    return this.getEnvNumber('PRODUCT_KNOWLEDGE_MAX_FEATURES', DEFAULT_MAX_FEATURES);
  }

  private getMaxPricingSignals(): number {
    return this.getEnvNumber('PRODUCT_KNOWLEDGE_MAX_PRICING_SIGNALS', DEFAULT_MAX_PRICING_SIGNALS);
  }

  private getMaxFaqs(): number {
    return this.getEnvNumber('PRODUCT_KNOWLEDGE_MAX_FAQS', DEFAULT_MAX_FAQS);
  }

  private getMaxDocTopics(): number {
    return this.getEnvNumber('PRODUCT_KNOWLEDGE_MAX_DOC_TOPICS', DEFAULT_MAX_DOC_TOPICS);
  }

  private getMaxTechFacts(): number {
    return this.getEnvNumber('PRODUCT_KNOWLEDGE_MAX_TECH_FACTS', DEFAULT_MAX_TECH_FACTS);
  }

  private getMaxCtas(): number {
    return this.getEnvNumber('PRODUCT_KNOWLEDGE_MAX_CTAS', DEFAULT_MAX_CTAS);
  }

  private getMaxCombinedChars(): number {
    return this.getEnvNumber('PRODUCT_KNOWLEDGE_MAX_CHARS', DEFAULT_MAX_COMBINED_CHARS);
  }

  private getEnvNumber(key: string, fallback: number): number {
    const value = this.configService.get<string>(key);
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
