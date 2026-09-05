import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

// Only safe generation options are ever accepted from the request body —
// title, topic, pillar, sourceBlogItemId, sourceSocialItemId, CTA text,
// evidence, audience, and format direction are always reconstructed
// server-side from the approved planning lineage.
export class VideoScriptGenerationOptionsDto {
  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsIn(['professional', 'conversational', 'educational', 'energetic', 'thought_leadership'])
  tone?: 'professional' | 'conversational' | 'educational' | 'energetic' | 'thought_leadership';

  @IsOptional()
  @IsIn(['short', 'medium', 'long'])
  duration?: 'short' | 'medium' | 'long';

  @IsOptional()
  @IsBoolean()
  includeCTA?: boolean;

  @IsOptional()
  @IsBoolean()
  includeHook?: boolean;

  @IsOptional()
  @IsBoolean()
  includeSceneDirections?: boolean;

  @IsOptional()
  @IsIn(['markdown', 'plain_text'])
  outputFormat?: 'markdown' | 'plain_text';
}
