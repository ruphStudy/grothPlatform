import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// Only safe generation options are ever accepted from the request body —
// title, platform, CTA text, hashtags, emojis, audience, and evidence are
// always reconstructed server-side from the approved planning lineage.
export class InstagramGenerationOptionsDto {
  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsIn(['conversational', 'friendly', 'professional', 'educational', 'inspirational'])
  tone?: 'conversational' | 'friendly' | 'professional' | 'educational' | 'inspirational';

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
  @Max(15)
  maxHashtags?: number;

  @IsOptional()
  @IsBoolean()
  includeEmojis?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxEmojis?: number;
}
