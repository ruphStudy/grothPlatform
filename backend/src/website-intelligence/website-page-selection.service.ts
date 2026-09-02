import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WebsiteDiscoveredPage, WebsitePageCategory, WebsiteSelectedPage } from './website-page-discovery.types';

const DEFAULT_MAX_PAGES = 8;
const OTHER_MIN_SCORE = 15;

// Priority order (highest value first) used both to size the category bonus
// and to decide first-pass diversity order.
const CATEGORY_PRIORITY_ORDER: WebsitePageCategory[] = [
  'product',
  'features',
  'pricing',
  'solutions',
  'use-cases',
  'about',
  'integrations',
  'faq',
  'docs',
  'customers',
  'other',
];

const CATEGORY_CAPS: Record<WebsitePageCategory, number> = {
  product: 2,
  features: 2,
  solutions: 2,
  pricing: 1,
  about: 1,
  'use-cases': 2,
  integrations: 1,
  faq: 1,
  docs: 1,
  customers: 1,
  other: 1,
};

const CATEGORY_REASONS: Record<WebsitePageCategory, string> = {
  product: 'Primary product page',
  features: 'Feature overview',
  pricing: 'Pricing/package information',
  solutions: 'Solution overview',
  'use-cases': 'Use-case evidence',
  about: 'Company/product context',
  integrations: 'Integration ecosystem',
  faq: 'FAQ/support evidence',
  docs: 'Documentation reference',
  customers: 'Customer evidence',
  other: 'Additional relevant page',
};

interface ScoredCandidate {
  page: WebsiteDiscoveredPage;
  depth: number;
  categoryBonus: number;
  priority: number;
}

@Injectable()
export class WebsitePageSelectionService {
  constructor(private readonly configService: ConfigService) {}

  selectImportantPages(pages: WebsiteDiscoveredPage[]): WebsiteSelectedPage[] {
    if (pages.length === 0) {
      return [];
    }

    const maxPages = this.getMaxPages();
    const scored = pages
      .filter((page) => page.category !== 'other' || page.score >= OTHER_MIN_SCORE)
      .map((page) => this.score(page));

    const byCategory = new Map<WebsitePageCategory, ScoredCandidate[]>();
    for (const candidate of scored) {
      const list = byCategory.get(candidate.page.category) ?? [];
      list.push(candidate);
      byCategory.set(candidate.page.category, list);
    }
    for (const list of byCategory.values()) {
      list.sort(this.compareCandidates);
    }

    const selected: ScoredCandidate[] = [];
    const selectedUrls = new Set<string>();
    const countByCategory = new Map<WebsitePageCategory, number>();

    const take = (candidate: ScoredCandidate) => {
      selected.push(candidate);
      selectedUrls.add(candidate.page.url);
      countByCategory.set(candidate.page.category, (countByCategory.get(candidate.page.category) ?? 0) + 1);
    };

    // First pass: diversity — best candidate from each category, in priority order.
    for (const category of CATEGORY_PRIORITY_ORDER) {
      if (selected.length >= maxPages) break;
      const candidates = byCategory.get(category);
      if (!candidates || candidates.length === 0) continue;
      const best = candidates[0];
      if ((countByCategory.get(category) ?? 0) < CATEGORY_CAPS[category]) {
        take(best);
      }
    }

    // Second pass: fill remaining slots with next-best candidates overall,
    // respecting per-category caps.
    if (selected.length < maxPages) {
      const pool = scored
        .filter((candidate) => !selectedUrls.has(candidate.page.url))
        .filter((candidate) => (countByCategory.get(candidate.page.category) ?? 0) < CATEGORY_CAPS[candidate.page.category])
        .sort(this.compareCandidates);

      for (const candidate of pool) {
        if (selected.length >= maxPages) break;
        if ((countByCategory.get(candidate.page.category) ?? 0) >= CATEGORY_CAPS[candidate.page.category]) continue;
        take(candidate);
      }
    }

    return selected
      .sort(this.compareCandidates)
      .map((candidate) => ({
        ...candidate.page,
        priority: candidate.priority,
        selectionReason: CATEGORY_REASONS[candidate.page.category],
      }));
  }

  private score(page: WebsiteDiscoveredPage): ScoredCandidate {
    const depth = page.path.split('/').filter(Boolean).length;
    const priorityRank = CATEGORY_PRIORITY_ORDER.indexOf(page.category);
    const categoryBonus = (CATEGORY_PRIORITY_ORDER.length - priorityRank) * 5;
    const depthPenalty = Math.max(0, depth - 1) * 5;
    const priority = page.score + categoryBonus - depthPenalty;
    return { page, depth, categoryBonus, priority };
  }

  private compareCandidates = (a: ScoredCandidate, b: ScoredCandidate): number => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.page.score !== a.page.score) return b.page.score - a.page.score;
    if (a.depth !== b.depth) return a.depth - b.depth;
    if (a.page.path.length !== b.page.path.length) return a.page.path.length - b.page.path.length;
    return a.page.url.localeCompare(b.page.url);
  };

  private getMaxPages(): number {
    const value = this.configService.get<string>('WEBSITE_SELECTION_MAX_PAGES');
    const parsed = value ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_PAGES;
  }
}
