import type { ProductWebsitePageRef, ProductWebsiteKnowledgeFailure } from '../../website-intelligence/product-website-knowledge.types';
import type { WebsiteFaqItem } from '../../website-intelligence/website-page-knowledge.types';

export interface CompetitorWebsiteAnalysis {
  name: string;
  url: string;
  domain: string;

  relevanceScore: number;
  reasons: string[];
  sourceQueries: string[];

  finalUrl?: string;
  confidenceScore: number;
  quality: 'high' | 'medium' | 'low';

  title?: string;
  metaDescription?: string;
  keyStatements: string[];
  features: string[];
  pricingSignals: string[];
  faqs: WebsiteFaqItem[];
  documentation: {
    topics: string[];
    technicalFacts: string[];
  };
  callsToAction: string[];
  pagesAnalyzed: ProductWebsitePageRef[];
  missingInformation: string[];
  warnings: string[];
  failures: ProductWebsiteKnowledgeFailure[];

  analyzedAt: Date;
}

export interface CompetitorAnalysisFailure {
  name: string;
  domain: string;
  url: string;
  reason: string;
}

export interface CompetitorWebsiteAnalysisBatchResult {
  competitors: CompetitorWebsiteAnalysis[];
  failures: CompetitorAnalysisFailure[];
  attemptedCount: number;
  analyzedCount: number;
  failedCount: number;
  analyzedAt: Date;
}
