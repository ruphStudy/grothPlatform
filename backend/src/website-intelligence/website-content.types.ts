export interface WebsiteExtractedContent {
  url: string;
  title?: string;
  metaDescription?: string;

  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
  };

  paragraphs: string[];
  listItems: string[];
  ctas: string[];

  textContent: string;
  fetchedAt: Date;

  extraction: {
    originalCharacters: number;
    extractedCharacters: number;
    truncated: boolean;
  };
}
