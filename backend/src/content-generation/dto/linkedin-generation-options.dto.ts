import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// Only safe generation options are ever accepted from the request body —
// platform, title, CTA text, keywords, audience, and evidence are always
// reconstructed server-side from the approved planning lineage.
export class LinkedInGenerationOptionsDto {
  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsIn(['professional', 'conversational', 'thought_leadership'])
  tone?: 'professional' | 'conversational' | 'thought_leadership';

  @IsOptional()
  @IsIn(['short', 'medium', 'long'])
  length?: 'short' | 'medium' | 'long';

  @IsOptional()
  @IsBoolean()
  includeCTA?: boolean;

  @IsOptional()
  @IsBoolean()
  includeHashtags?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxHashtags?: number;
}
