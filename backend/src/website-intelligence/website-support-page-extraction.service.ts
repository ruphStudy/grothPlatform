import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cheerio from 'cheerio';
import { WebsiteContentExtractorService } from './website-content-extractor.service';
import type { WebsiteExtractedContent } from './website-content.types';
import { WebsiteFetchService } from './website-fetch.service';
import type { WebsiteDiscoveredPage, WebsiteSelectedPage } from './website-page-discovery.types';
import { WebsitePageDiscoveryService } from './website-page-discovery.service';
import type {
  WebsiteCorePageExtractionResult,
  WebsiteFaqItem,
  WebsiteKnowledgePageCategory,
  WebsitePageKnowledge,
  WebsitePageKnowledgeFailure,
} from './website-page-knowledge.types';
import { WebsitePageSelectionService } from './website-page-selection.service';
import type { WebsiteFetchResult } from './website-fetch.types';

const DEFAULT_MAX_SUPPORT_PAGES = 3;
const DEFAULT_FAQ_MAX_ITEMS = 30;
const DEFAULT_DOC_MAX_TOPICS = 40;
const DEFAULT_DOC_MAX_FACTS = 40;
const MAX_ANSWER_CHARS = 1000;

const SUPPORTED_CATEGORIES = new Set<WebsiteKnowledgePageCategory>(['faq', 'docs']);

const QUESTION_END_PATTERN = /\?\s*$/;
const QUESTION_START_PATTERN = /^(what|how|why|can|do|does|is|are|when|where|which|who)\b/i;

const DOC_SIGNAL_PATTERN =
  /\b(api|sdk|integrat\w*|configur\w*|install\w*|setup|authenticat\w*|token|webhook|import|export|deploy\w*|support|platform|cli|dashboard|workspace|project|account|role|permission)\w*/i;

const DOC_NOISE_TERMS = new Set([
  'previous',
  'next',
  'edit this page',
  'on this page',
  'copy',
  'search',
  'table of contents',
]);

interface SupportExtractionOutcome {
  ok: boolean;
  page?: WebsitePageKnowledge;
  failure?: WebsitePageKnowledgeFailure;
}

@Injectable()
export class WebsiteSupportPageExtractionService {
  private readonly logger = new Logger(WebsiteSupportPageExtractionService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly websiteFetchService: WebsiteFetchService,
    private readonly websiteContentExtractorService: WebsiteContentExtractorService,
    private readonly websitePageDiscoveryService: WebsitePageDiscoveryService,
    private readonly websitePageSelectionService: WebsitePageSelectionService,
  ) {}

  /**
   * End-to-end orchestration: homepage fetch -> discover -> select -> extract
   * support (faq/docs) page knowledge.
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
    const targets = supported.slice(0, this.getMaxSupportPages());

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
  ): Promise<SupportExtractionOutcome> {
    try {
      const fetchResult = await this.websiteFetchService.fetchWebsite(selected.url);
      const extracted = this.websiteContentExtractorService.extract(fetchResult);
      return { ok: true, page: this.buildKnowledge(selected.category, extracted, fetchResult) };
    } catch (err) {
      const reason = err instanceof HttpException ? err.message : 'Website page could not be processed';
      this.logger.warn(`Support page extraction failed for ${selected.url}: ${(err as Error).message}`);
      return { ok: false, failure: { url: selected.url, category: selected.category, reason } };
    }
  }

  private buildKnowledge(
    category: WebsiteKnowledgePageCategory,
    extracted: WebsiteExtractedContent,
    fetchResult: WebsiteFetchResult,
  ): WebsitePageKnowledge {
    const rawHeadings = [...extracted.headings.h1, ...extracted.headings.h2, ...extracted.headings.h3];
    const headings = this.dedupe(rawHeadings);

    const faqItems = category === 'faq' ? this.extractFaqItems(fetchResult) : [];
    const docTopics = category === 'docs' ? this.extractDocTopics(rawHeadings) : [];
    const technicalFacts = category === 'docs' ? this.extractTechnicalFacts(extracted) : [];

    const maxChars = this.getMaxKnowledgeChars();

    return {
      url: extracted.url,
      category,
      title: extracted.title,
      metaDescription: extracted.metaDescription,
      headings,
      keyStatements: [],
      featureItems: [],
      pricingSignals: [],
      ctas: this.dedupe(extracted.ctas),
      faqItems,
      docTopics,
      technicalFacts,
      textContent: extracted.textContent.slice(0, maxChars),
      fetchedAt: extracted.fetchedAt,
      extraction: extracted.extraction,
    };
  }

  private extractFaqItems(fetchResult: WebsiteFetchResult): WebsiteFaqItem[] {
    let $: cheerio.CheerioAPI;
    try {
      $ = cheerio.load(fetchResult.body);
    } catch (err) {
      this.logger.warn(`Failed to parse HTML for FAQ extraction at ${fetchResult.finalUrl}: ${(err as Error).message}`);
      return [];
    }
    $('script, style, noscript, nav, footer').remove();

    const items: WebsiteFaqItem[] = [];
    const seen = new Set<string>();

    const addItem = (question: string, answer?: string) => {
      const normalizedQuestion = this.normalizeText(question);
      if (!normalizedQuestion) return;
      const key = normalizedQuestion.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const normalizedAnswer = answer ? this.normalizeText(answer) : undefined;
      items.push({
        question: normalizedQuestion,
        ...(normalizedAnswer ? { answer: normalizedAnswer.slice(0, MAX_ANSWER_CHARS) } : {}),
      });
    };

    $('details').each((_, el) => {
      const $details = $(el);
      const question = this.normalizeText($details.find('summary').first().text());
      if (!question) return;
      const $clone = $details.clone();
      $clone.find('summary').remove();
      const answer = this.normalizeText($clone.text());
      addItem(question, answer);
    });

    $('h1, h2, h3, h4, dt').each((_, el) => {
      const $heading = $(el);
      const text = this.normalizeText($heading.text());
      if (!text || !this.isQuestion(text)) return;

      let $next = $heading.next();
      let hops = 0;
      while ($next.length && hops < 3) {
        if ($next.is('p, li, dd')) {
          addItem(text, this.normalizeText($next.text()));
          return;
        }
        if ($next.is('h1, h2, h3, h4, h5, h6, details')) break;
        $next = $next.next();
        hops += 1;
      }
      addItem(text);
    });

    return items.slice(0, this.getFaqMaxItems());
  }

  private isQuestion(text: string): boolean {
    return QUESTION_END_PATTERN.test(text) || QUESTION_START_PATTERN.test(text);
  }

  private extractDocTopics(headings: string[]): string[] {
    const filtered = headings.filter((h) => !this.isDocNoise(h));
    return this.dedupe(filtered).slice(0, this.getDocMaxTopics());
  }

  private extractTechnicalFacts(extracted: WebsiteExtractedContent): string[] {
    const candidates = [...extracted.paragraphs, ...extracted.listItems].filter((t) => !this.isDocNoise(t));
    const signalMatches = candidates.filter((t) => DOC_SIGNAL_PATTERN.test(t));
    return this.dedupe(signalMatches.length > 0 ? signalMatches : candidates).slice(0, this.getDocMaxFacts());
  }

  private isDocNoise(text: string): boolean {
    return DOC_NOISE_TERMS.has(text.trim().toLowerCase());
  }

  private normalizeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  private dedupe(items: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of items) {
      const normalized = this.normalizeText(raw);
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
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
  }

  private getMaxSupportPages(): number {
    const value = this.configService.get<string>('WEBSITE_SUPPORT_EXTRACTION_MAX_PAGES');
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_SUPPORT_PAGES;
  }

  private getFaqMaxItems(): number {
    const value = this.configService.get<string>('WEBSITE_FAQ_MAX_ITEMS');
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FAQ_MAX_ITEMS;
  }

  private getDocMaxTopics(): number {
    const value = this.configService.get<string>('WEBSITE_DOC_MAX_TOPICS');
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DOC_MAX_TOPICS;
  }

  private getDocMaxFacts(): number {
    const value = this.configService.get<string>('WEBSITE_DOC_MAX_FACTS');
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DOC_MAX_FACTS;
  }

  private getMaxKnowledgeChars(): number {
    const value = this.configService.get<string>('WEBSITE_PAGE_KNOWLEDGE_MAX_CHARS');
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 12000;
  }
}
