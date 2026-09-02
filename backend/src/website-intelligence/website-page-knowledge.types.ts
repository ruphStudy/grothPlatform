export type WebsiteKnowledgePageCategory = 'about' | 'product' | 'features' | 'pricing' | 'faq' | 'docs';

export interface WebsiteFaqItem {
  question: string;
  answer?: string;
}

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

  // Populated only for category 'faq'; empty otherwise.
  faqItems: WebsiteFaqItem[];
  // Populated only for category 'docs'; empty otherwise.
  docTopics: string[];
  technicalFacts: string[];

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
