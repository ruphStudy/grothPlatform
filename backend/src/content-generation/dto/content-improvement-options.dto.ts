import { IsIn, IsOptional, IsString } from 'class-validator';

// Only safe, high-level options are ever accepted from the request body —
// the original content, review findings, evidence, CTA, and generation
// metadata are always reconstructed server-side from the persisted source
// version, never taken from the client (spec section 35).
export class ContentImprovementOptionsDto {
  @IsOptional()
  @IsIn(['all', 'facts', 'seo', 'readability', 'brand_voice', 'originality'])
  focus?: 'all' | 'facts' | 'seo' | 'readability' | 'brand_voice' | 'originality';

  @IsOptional()
  @IsString()
  language?: string;
}
