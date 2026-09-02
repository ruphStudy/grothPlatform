import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cheerio from 'cheerio';
import type { WebsiteExtractedContent } from './website-content.types';
import type { WebsiteFetchResult } from './website-fetch.types';

const DEFAULT_MAX_CHARS = 50000;
const MIN_PARAGRAPH_LENGTH = 20;
const MIN_LIST_ITEM_LENGTH = 2;
const MIN_CTA_LENGTH = 2;
const MAX_CTA_LENGTH = 40;

// Removed before any text is extracted. `header` is intentionally NOT included
// here — hero sections with real product copy commonly live inside <header>.
const NOISE_SELECTORS = ['script', 'style', 'noscript', 'svg', 'canvas', 'iframe', 'template', 'nav', 'footer'];

// Common navigation/utility labels that survive noise removal (e.g. links
// living outside <nav>/<footer>) and would otherwise pollute CTA/list output.
const NAV_LIKE_TERMS = new Set([
  'home',
  'about',
  'about us',
  'contact',
  'contact us',
  'blog',
  'careers',
  'privacy',
  'privacy policy',
  'terms',
  'terms of service',
  'faq',
  'help',
  'support',
  'login',
  'log in',
  'sign in',
  'menu',
]);

const HTML_LIKE_CONTENT_TYPES = new Set(['text/html', 'application/xhtml+xml']);

@Injectable()
export class WebsiteContentExtractorService {
  private readonly logger = new Logger(WebsiteContentExtractorService.name);

  constructor(private readonly configService: ConfigService) {}

  extract(fetchResult: WebsiteFetchResult): WebsiteExtractedContent {
    const baseContentType = (fetchResult.contentType ?? '').split(';')[0].trim().toLowerCase();

    if (HTML_LIKE_CONTENT_TYPES.has(baseContentType)) {
      return this.extractFromHtml(fetchResult);
    }

    return this.extractFromPlainText(fetchResult);
  }

  private extractFromHtml(fetchResult: WebsiteFetchResult): WebsiteExtractedContent {
    let $: cheerio.CheerioAPI;
    try {
      $ = cheerio.load(fetchResult.body);
    } catch (err) {
      this.logger.warn(`Failed to parse HTML for ${fetchResult.finalUrl}: ${(err as Error).message}`);
      throw new UnprocessableEntityException('Unable to parse website content');
    }

    const title = this.normalizeWhitespace($('title').first().text()) || undefined;
    const metaDescription = this.extractMetaDescription($);

    // Remove noise before extracting any text-bearing content.
    $(NOISE_SELECTORS.join(',')).remove();

    const headings = {
      h1: this.extractHeadings($, 'h1'),
      h2: this.extractHeadings($, 'h2'),
      h3: this.extractHeadings($, 'h3'),
    };
    const paragraphs = this.extractParagraphs($);
    const listItems = this.extractListItems($);
    const ctas = this.extractCtas($);

    const textContent = this.buildTextContent(title, headings, paragraphs, listItems, ctas);
    const { text, truncated } = this.enforceMaxChars(textContent);

    return {
      url: fetchResult.finalUrl,
      title,
      metaDescription,
      headings,
      paragraphs,
      listItems,
      ctas,
      textContent: text,
      fetchedAt: fetchResult.fetchedAt,
      extraction: {
        originalCharacters: textContent.length,
        extractedCharacters: text.length,
        truncated,
      },
    };
  }

  private extractFromPlainText(fetchResult: WebsiteFetchResult): WebsiteExtractedContent {
    const normalized = this.normalizeWhitespace(fetchResult.body);
    const { text, truncated } = this.enforceMaxChars(normalized);

    return {
      url: fetchResult.finalUrl,
      title: undefined,
      metaDescription: undefined,
      headings: { h1: [], h2: [], h3: [] },
      paragraphs: [],
      listItems: [],
      ctas: [],
      textContent: text,
      fetchedAt: fetchResult.fetchedAt,
      extraction: {
        originalCharacters: normalized.length,
        extractedCharacters: text.length,
        truncated,
      },
    };
  }

  private extractMetaDescription($: cheerio.CheerioAPI): string | undefined {
    const content =
      $('meta[name="description" i]').first().attr('content') ??
      $('meta[name="Description" i]').first().attr('content');
    const normalized = this.normalizeWhitespace(content ?? '');
    return normalized || undefined;
  }

  private extractHeadings($: cheerio.CheerioAPI, selector: string): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    $(selector).each((_, el) => {
      const text = this.normalizeWhitespace($(el).text());
      if (!text || seen.has(text)) return;
      seen.add(text);
      result.push(text);
    });
    return result;
  }

  private extractParagraphs($: cheerio.CheerioAPI): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    $('p').each((_, el) => {
      const text = this.normalizeWhitespace($(el).text());
      if (!text || text.length < MIN_PARAGRAPH_LENGTH || seen.has(text)) return;
      seen.add(text);
      result.push(text);
    });
    return result;
  }

  private extractListItems($: cheerio.CheerioAPI): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    $('li').each((_, el) => {
      const text = this.normalizeWhitespace($(el).text());
      if (!text || text.length < MIN_LIST_ITEM_LENGTH) return;
      const lower = text.toLowerCase();
      if (NAV_LIKE_TERMS.has(lower) || seen.has(lower)) return;
      seen.add(lower);
      result.push(text);
    });
    return result;
  }

  private extractCtas($: cheerio.CheerioAPI): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    $('button, a, [role="button"]').each((_, el) => {
      const text = this.normalizeWhitespace($(el).text());
      if (!text || text.length < MIN_CTA_LENGTH || text.length > MAX_CTA_LENGTH) return;
      const lower = text.toLowerCase();
      if (NAV_LIKE_TERMS.has(lower) || seen.has(lower)) return;
      seen.add(lower);
      result.push(text);
    });
    return result;
  }

  private buildTextContent(
    title: string | undefined,
    headings: { h1: string[]; h2: string[]; h3: string[] },
    paragraphs: string[],
    listItems: string[],
    ctas: string[],
  ): string {
    const parts: string[] = [];
    if (title) parts.push(title);
    parts.push(...headings.h1, ...headings.h2, ...headings.h3, ...paragraphs, ...listItems, ...ctas);
    return parts.filter(Boolean).join('\n');
  }

  private normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  private enforceMaxChars(text: string): { text: string; truncated: boolean } {
    const maxChars = this.getMaxChars();
    if (text.length <= maxChars) {
      return { text, truncated: false };
    }
    return { text: text.slice(0, maxChars), truncated: true };
  }

  private getMaxChars(): number {
    const value = this.configService.get<string>('WEBSITE_EXTRACT_MAX_CHARS');
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_CHARS;
  }
}
