import { IsIn, IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

// Only safe generation options are ever accepted from the request body —
// title/keywords/CTA/evidence are always reconstructed server-side from the
// approved planning lineage, never trusted from the client.
export class BlogGenerationOptionsDto {
  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  minWords?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  maxWords?: number;

  @IsOptional()
  @IsIn(['markdown', 'plain_text'])
  outputFormat?: 'markdown' | 'plain_text';
}
