import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

// Only safe generation options are ever accepted from the request body —
// subject text, title, CTA text, evidence, audience, keywords, and raw
// source content are always reconstructed server-side. `sourceType`/
// `sourceId` are route params, validated in the service, not the body.
export class NewsletterGenerationOptionsDto {
  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsIn(['professional', 'conversational', 'educational', 'thought_leadership'])
  tone?: 'professional' | 'conversational' | 'educational' | 'thought_leadership';

  @IsOptional()
  @IsIn(['short', 'medium', 'long'])
  length?: 'short' | 'medium' | 'long';

  @IsOptional()
  @IsBoolean()
  includeSubjectLine?: boolean;

  @IsOptional()
  @IsBoolean()
  includePreheader?: boolean;

  @IsOptional()
  @IsBoolean()
  includeCTA?: boolean;

  @IsOptional()
  @IsIn(['markdown', 'plain_text'])
  outputFormat?: 'markdown' | 'plain_text';
}
