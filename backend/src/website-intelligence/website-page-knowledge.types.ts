export type WebsiteKnowledgePageCategory = 'about' | 'product' | 'features' | 'pricing';

export interface WebsitePageKnowledge {
  url: string;
  category: WebsiteKnowledgePageCategory;

  title?: string;
  metaDescription?: string;

  headings: string[];

  keyStatements: string[];
  featureItems: string[];
  pricingSignals: string[];
  ctas: string[];

  textContent: string;
  fetchedAt: Date;

  extraction: {
    originalCharacters: number;
    extractedCharacters: number;
    truncated: boolean;
  };
}

export interface WebsitePageKnowledgeFailure {
  url: string;
  category: WebsiteKnowledgePageCategory;
  reason: string;
}

export interface WebsiteCorePageExtractionResult {
  pages: WebsitePageKnowledge[];
  failures: WebsitePageKnowledgeFailure[];
}
