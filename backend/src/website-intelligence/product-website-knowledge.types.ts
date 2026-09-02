import type { WebsiteFaqItem, WebsiteKnowledgePageCategory } from './website-page-knowledge.types';

export type ProductWebsitePageCategory = WebsiteKnowledgePageCategory | 'homepage';

export interface ProductWebsitePageRef {
  url: string;
  category: ProductWebsitePageCategory;
  fetchedAt: Date;
}

export interface ProductWebsiteKnowledgeFailure {
  url: string;
  category: WebsiteKnowledgePageCategory;
  reason: string;
}

export interface ProductKnowledgeAssessment {
  confidenceScore: number;

  coverage: {
    identity: number;
    features: number;
    pricing: number;
    faq: number;
    documentation: number;
  };

  missingInformation: string[];
  warnings: string[];

  quality: 'high' | 'medium' | 'low';
}

export interface ProductWebsiteKnowledgeBase {
  source: {
    configuredUrl: string;
    finalHomepageUrl: string;
    homepageFetchedAt: Date;
  };

  pagesAnalyzed: ProductWebsitePageRef[];

  identity: {
    title?: string;
    metaDescription?: string;
    keyStatements: string[];
  };

  features: string[];

  pricing: {
    signals: string[];
  };

  faqs: WebsiteFaqItem[];

  documentation: {
    topics: string[];
    technicalFacts: string[];
  };

  callsToAction: string[];

  combinedText: string;
  combinedTextTruncated: boolean;

  extractionStats: {
    discoveredPages: number;
    selectedPages: number;
    attemptedPages: number;
    successfulPages: number;
    failedPages: number;
  };

  failures: ProductWebsiteKnowledgeFailure[];
}

export interface ProductWebsiteKnowledge extends ProductWebsiteKnowledgeBase {
  assessment: ProductKnowledgeAssessment;
}
