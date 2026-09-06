import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// Only safe generation options are ever accepted from the request body —
// the full image prompt is always built server-side from the persisted
// blog ContentVersion (17B). A client can never submit a prompt.
export class BlogHeroGenerationOptionsDto {
  @IsOptional()
  @IsIn(['16:9', '3:2', '1:1'])
  aspectRatio?: '16:9' | '3:2' | '1:1';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  styleDirection?: string;

  @IsOptional()
  @IsBoolean()
  includeTextOverlay?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  overlayText?: string;
}
