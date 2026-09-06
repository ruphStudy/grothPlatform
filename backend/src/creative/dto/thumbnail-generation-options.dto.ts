import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// Only safe generation options are ever accepted from the request body —
// the full image prompt is always built server-side from the persisted
// blog or video script ContentVersion (17B). A client can never submit a
// prompt. Overlay text is capped tighter here (50 chars) than hero/social
// images by CreativeGenerationService's thumbnail feature config.
export class ThumbnailGenerationOptionsDto {
  @IsOptional()
  @IsIn(['16:9', '1:1'])
  aspectRatio?: '16:9' | '1:1';

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
