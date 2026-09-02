import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cheerio from 'cheerio';
import type { WebsiteFetchResult } from './website-fetch.types';
import type { WebsiteDiscoveredPage, WebsitePageCategory } from './website-page-discovery.types';

const DEFAULT_MAX_PAGES = 20;

const STATIC_ASSET_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'ico', 'bmp',
  'css', 'js', 'mjs', 'json', 'xml',
  'pdf', 'zip', 'rar', '7z', 'tar', 'gz',
  'mp4', 'webm', 'mov', 'avi', 'mp3', 'wav',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
]);

const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid',
]);

// Path substrings that indicate auth-only, transactional, legal, or otherwise
// non-product-knowledge pages. Matched against the lowercased pathname.
const EXCLUDED_PATH_KEYWORDS = [
  'logout', 'sign-out', 'signout',
  'login', 'sign-in', 'signin',
  'signup', 'sign-up', 'register',
  'privacy', 'terms', 'cookie', 'legal', 'gdpr',
  'careers', 'jobs', 'press', 'media',
  'contact',
  'cart', 'checkout', 'account', 'billing',
];

// Ordered by priority: first matching rule wins when a link matches more
// than one category (e.g. a path also containing a generic word).
const CATEGORY_RULES: { category: WebsitePageCategory; pathPatterns: RegExp[]; labelPatterns: RegExp[] }[] = [
  { category: 'pricing', pathPatterns: [/^\/(pricing|plans)(\/|$)/], labelPatterns: [/\bpricing\b/i, /\bplans?\b/i] },
  {
    category: 'features',
    pathPatterns: [/^\/(features|product-features|capabilities|how-it-works)(\/|$)/],
    labelPatterns: [/\bfeatures?\b/i, /\bcapabilities\b/i, /\bhow it works\b/i],
  },
  { category: 'product', pathPatterns: [/^\/(products?|platform)(\/|$)/], labelPatterns: [/\bproducts?\b/i, /\bplatform\b/i] },
  { category: 'solutions', pathPatterns: [/^\/solutions(\/|$)/], labelPatterns: [/\bsolutions?\b/i] },
  {
    category: 'about',
    pathPatterns: [/^\/(about|company|about-us)(\/|$)/],
    labelPatterns: [/\babout\b/i, /\bcompany\b/i],
  },
  { category: 'use-cases', pathPatterns: [/^\/(use-cases|usecases)(\/|$)/], labelPatterns: [/\buse\s*cases?\b/i] },
  {
    category: 'docs',
    pathPatterns: [/^\/(docs|documentation|help|knowledge-base|kb)(\/|$)/],
    labelPatterns: [/\bdocs?\b/i, /\bdocumentation\b/i, /\bhelp\b/i, /\bknowledge base\b/i],
  },
  {
    category: 'customers',
    pathPatterns: [/^\/(customers|case-studies|success-stories|testimonials)(\/|$)/],
    labelPatterns: [/\bcustomers?\b/i, /\bcase studies?\b/i, /\bsuccess stories\b/i, /\btestimonials?\b/i],
  },
  {
    category: 'integrations',
    pathPatterns: [/^\/(integrations|apps|marketplace)(\/|$)/],
    labelPatterns: [/\bintegrations?\b/i],
  },
  { category: 'faq', pathPatterns: [/^\/faqs?(\/|$)/], labelPatterns: [/\bfaqs?\b/i, /\bfrequently asked\b/i] },
];

@Injectable()
export class WebsitePageDiscoveryService {
  private readonly logger = new Logger(WebsitePageDiscoveryService.name);

  constructor(private readonly configService: ConfigService) {}

  discoverPages(fetchResult: WebsiteFetchResult): WebsiteDiscoveredPage[] {
    const homepageUrl = this.safeParseUrl(fetchResult.finalUrl);
    if (!homepageUrl) {
      return [];
    }

    let $: cheerio.CheerioAPI;
    try {
      $ = cheerio.load(fetchResult.body);
    } catch (err) {
      this.logger.warn(`Failed to parse HTML for page discovery on ${fetchResult.finalUrl}: ${(err as Error).message}`);
      return [];
    }

    const homeHostname = this.normalizeHostname(homepageUrl.hostname);
    const candidates = new Map<string, WebsiteDiscoveredPage>();

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href')?.trim();
      if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) {
        return;
      }

      let candidateUrl: URL;
      try {
        candidateUrl = new URL(href, homepageUrl);
      } catch {
        return;
      }

      if (candidateUrl.protocol !== 'http:' && candidateUrl.protocol !== 'https:') return;
      if (this.normalizeHostname(candidateUrl.hostname) !== homeHostname) return;

      candidateUrl.hash = '';
      this.stripTrackingParams(candidateUrl);

      if (this.isHomepageUrl(candidateUrl, homepageUrl)) return;
      if (this.isStaticAsset(candidateUrl.pathname)) return;
      if (this.isExcludedPath(candidateUrl.pathname)) return;

      const label = this.normalizeWhitespace($(el).text());
      const { category, score } = this.classifyAndScore(candidateUrl.pathname, label);

      const key = candidateUrl.toString();
      const existing = candidates.get(key);
      if (!existing || score > existing.score) {
        candidates.set(key, { url: key, path: candidateUrl.pathname, label: label || undefined, category, score });
      }
    });

    const maxPages = this.getMaxPages();
    return Array.from(candidates.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPages);
  }

  private classifyAndScore(pathname: string, label: string): { category: WebsitePageCategory; score: number } {
    const normalizedLabel = label.toLowerCase();
    const segments = pathname.split('/').filter(Boolean);
    const depthAdjustment = segments.length <= 1 ? 10 : -8 * (segments.length - 1);

    for (const rule of CATEGORY_RULES) {
      const pathMatch = rule.pathPatterns.some((pattern) => pattern.test(pathname));
      const labelMatch = rule.labelPatterns.some((pattern) => pattern.test(normalizedLabel));
      if (pathMatch || labelMatch) {
        let score = 0;
        if (pathMatch) score += 50;
        if (labelMatch) score += 30;
        score += depthAdjustment;
        return { category: rule.category, score: Math.max(0, Math.min(100, score)) };
      }
    }

    return { category: 'other', score: Math.max(0, Math.min(100, 10 + depthAdjustment)) };
  }

  private stripTrackingParams(url: URL): void {
    for (const key of Array.from(url.searchParams.keys())) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
  }

  private isStaticAsset(pathname: string): boolean {
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    return match ? STATIC_ASSET_EXTENSIONS.has(match[1].toLowerCase()) : false;
  }

  private isExcludedPath(pathname: string): boolean {
    const lower = pathname.toLowerCase();
    return EXCLUDED_PATH_KEYWORDS.some((keyword) => lower.includes(keyword));
  }

  private normalizeHostname(hostname: string): string {
    return hostname.toLowerCase().replace(/^www\./, '');
  }

  private isHomepageUrl(candidate: URL, homepage: URL): boolean {
    const candidatePath = candidate.pathname.replace(/\/+$/, '') || '/';
    const homePath = homepage.pathname.replace(/\/+$/, '') || '/';
    return candidatePath === homePath && candidate.search === '';
  }

  private normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  private safeParseUrl(rawUrl: string): URL | null {
    try {
      return new URL(rawUrl);
    } catch {
      return null;
    }
  }

  private getMaxPages(): number {
    const value = this.configService.get<string>('WEBSITE_DISCOVERY_MAX_PAGES');
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_PAGES;
  }
}
