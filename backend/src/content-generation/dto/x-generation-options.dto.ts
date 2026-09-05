import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// Only safe generation options are ever accepted from the request body —
// platform, title, CTA text, keywords, audience, and evidence are always
// reconstructed server-side from the approved planning lineage.
export class XGenerationOptionsDto {
  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsIn(['single_post', 'thread'])
  mode?: 'single_post' | 'thread';

  @IsOptional()
  @IsIn(['concise', 'professional', 'conversational', 'thought_leadership'])
  tone?: 'concise' | 'professional' | 'conversational' | 'thought_leadership';

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

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(20)
  threadMaxPosts?: number;
}
