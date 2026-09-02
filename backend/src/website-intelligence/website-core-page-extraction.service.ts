import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebsiteContentExtractorService } from './website-content-extractor.service';
import type { WebsiteExtractedContent } from './website-content.types';
import { WebsiteFetchService } from './website-fetch.service';
import type { WebsiteDiscoveredPage, WebsiteSelectedPage } from './website-page-discovery.types';
import { WebsitePageDiscoveryService } from './website-page-discovery.service';
import type {
  WebsiteCorePageExtractionResult,
  WebsiteKnowledgePageCategory,
  WebsitePageKnowledge,
  WebsitePageKnowledgeFailure,
} from './website-page-knowledge.types';
import { WebsitePageSelectionService } from './website-page-selection.service';
import type { WebsiteFetchResult } from './website-fetch.types';

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_MAX_CORE_PAGES = 5;
const DEFAULT_MAX_KNOWLEDGE_CHARS = 12000;

const SUPPORTED_CATEGORIES = new Set<WebsiteKnowledgePageCategory>(['about', 'product', 'features', 'pricing']);

const ABOUT_KEYWORDS = /\b(we|our|mission|vision|believe|founded|help|empower|provide|serve|customers?|users?|built|designed|company|team)\b/i;

const FEATURE_KEYWORDS = /\b(feature|capabilit|platform|automat|manage|monitor|build|create|integrat|analyz|secure|support)\w*/i;

const PRICING_PATTERN =
  /[$₹€£]\s?\d|per\s?month|\/month|per\s?year|\/year|monthly|annually|\bannual\b|free\s?trial|\bfree\b|\btrial\b|\bstarter\b|\bbasic\b|\bpro\b|\bprofessional\b|\bbusiness\b|\benterprise\b|contact\s?sales|custom\s?pricing/i;

interface CoreExtractionOutcome {
  ok: boolean;
  page?: WebsitePageKnowledge;
  failure?: WebsitePageKnowledgeFailure;
}

@Injectable()
export class WebsiteCorePageExtractionService {
  private readonly logger = new Logger(WebsiteCorePageExtractionService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly websiteFetchService: WebsiteFetchService,
    private readonly websiteContentExtractorService: WebsiteContentExtractorService,
    private readonly websitePageDiscoveryService: WebsitePageDiscoveryService,
    private readonly websitePageSelectionService: WebsitePageSelectionService,
  ) {}

  /**
   * End-to-end orchestration: homepage fetch -> discover -> select -> extract
   * core (about/product/features/pricing) page knowledge.
   */
  async extractFromHomepage(homepageUrl: string): Promise<{
    homepageFetchResult: WebsiteFetchResult;
    discovered: WebsiteDiscoveredPage[];
    selected: WebsiteSelectedPage[];
    extraction: WebsiteCorePageExtractionResult;
  }> {
    const homepageFetchResult = await this.websiteFetchService.fetchWebsite(homepageUrl);
    const discovered = this.websitePageDiscoveryService.discoverPages(homepageFetchResult);
    const selected = this.websitePageSelectionService.selectImportantPages(discovered);
    const extraction = await this.extractSelectedPages(selected);
    return { homepageFetchResult, discovered, selected, extraction };
  }

  async extractSelectedPages(pages: WebsiteSelectedPage[]): Promise<WebsiteCorePageExtractionResult> {
    const supported = pages.filter((page): page is WebsiteSelectedPage & { category: WebsiteKnowledgePageCategory } =>
      SUPPORTED_CATEGORIES.has(page.category as WebsiteKnowledgePageCategory),
    );
    const targets = supported.slice(0, this.getMaxCorePages());

    if (targets.length === 0) {
      return { pages: [], failures: [] };
    }

    const outcomes = await this.mapWithConcurrency(targets, this.getConcurrency(), (page) => this.processPage(page));

    const result: WebsiteCorePageExtractionResult = { pages: [], failures: [] };
    for (const outcome of outcomes) {
      if (outcome.ok && outcome.page) result.pages.push(outcome.page);
      else if (outcome.failure) result.failures.push(outcome.failure);
    }
    return result;
  }

  private async processPage(
    selected: WebsiteSelectedPage & { category: WebsiteKnowledgePageCategory },
  ): Promise<CoreExtractionOutcome> {
    try {
      const fetchResult = await this.websiteFetchService.fetchWebsite(selected.url);
      const extracted = this.websiteContentExtractorService.extract(fetchResult);
      return { ok: true, page: this.buildKnowledge(selected.category, extracted) };
    } catch (err) {
      const reason = err instanceof HttpException ? err.message : 'Website page could not be processed';
      this.logger.warn(`Core page extraction failed for ${selected.url}: ${(err as Error).message}`);
      return { ok: false, failure: { url: selected.url, category: selected.category, reason } };
    }
  }

  private buildKnowledge(category: WebsiteKnowledgePageCategory, extracted: WebsiteExtractedContent): WebsitePageKnowledge {
    const headings = this.dedupe([...extracted.headings.h1, ...extracted.headings.h2, ...extracted.headings.h3]);

    const keyStatements = category === 'about' ? this.extractKeyStatements(extracted) : [];
    const featureItems =
      category === 'product' || category === 'features' ? this.extractFeatureItems(extracted) : [];
    const pricingSignals = category === 'pricing' ? this.extractPricingSignals(extracted) : [];

    const maxChars = this.getMaxKnowledgeChars();

    return {
      url: extracted.url,
      category,
      title: extracted.title,
      metaDescription: extracted.metaDescription,
      headings,
      keyStatements,
      featureItems,
      pricingSignals,
      ctas: this.dedupe(extracted.ctas),
      textContent: extracted.textContent.slice(0, maxChars),
      fetchedAt: extracted.fetchedAt,
      extraction: extracted.extraction,
    };
  }

  private extractKeyStatements(extracted: WebsiteExtractedContent): string[] {
    const candidates = [...extracted.paragraphs, ...extracted.listItems];
    const matched = candidates.filter((text) => ABOUT_KEYWORDS.test(text));
    return this.dedupe(matched.length > 0 ? matched : candidates).slice(0, 20);
  }

  private extractFeatureItems(extracted: WebsiteExtractedContent): string[] {
    const headingMatches = [...extracted.headings.h2, ...extracted.headings.h3].filter((h) => FEATURE_KEYWORDS.test(h));
    const paragraphMatches = extracted.paragraphs.filter((p) => p.length <= 160 && FEATURE_KEYWORDS.test(p));
    const combined = [...extracted.listItems, ...headingMatches, ...paragraphMatches];
    return this.dedupe(combined.length > 0 ? combined : extracted.listItems).slice(0, 30);
  }

  private extractPricingSignals(extracted: WebsiteExtractedContent): string[] {
    const candidates = [
      ...extracted.headings.h1,
      ...extracted.headings.h2,
      ...extracted.headings.h3,
      ...extracted.paragraphs,
      ...extracted.listItems,
    ];
    return this.dedupe(candidates.filter((text) => PRICING_PATTERN.test(text))).slice(0, 30);
  }

  private dedupe(items: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of items) {
      const normalized = raw.replace(/\s+/g, ' ').trim();
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(normalized);
    }
    return result;
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let cursor = 0;

    const runWorker = async () => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        results[index] = await worker(items[index]);
      }
    };

    const workerCount = Math.max(1, Math.min(concurrency, items.length));
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    return results;
  }

  private getConcurrency(): number {
    const value = this.configService.get<string>('WEBSITE_PAGE_FETCH_CONCURRENCY');
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CONCURRENCY;
  }

  private getMaxCorePages(): number {
    const value = this.configService.get<string>('WEBSITE_CORE_EXTRACTION_MAX_PAGES');
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_CORE_PAGES;
  }

  private getMaxKnowledgeChars(): number {
    const value = this.configService.get<string>('WEBSITE_PAGE_KNOWLEDGE_MAX_CHARS');
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_KNOWLEDGE_CHARS;
  }
}
