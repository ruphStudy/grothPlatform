import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// Only safe generation options are ever accepted from the request body —
// the full image prompt is always built server-side from persisted
// content/campaign context (17B). A client can never submit a prompt.
export class SocialImageGenerationOptionsDto {
  @IsOptional()
  @IsIn(['1:1', '4:5', '16:9'])
  aspectRatio?: '1:1' | '4:5' | '16:9';

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
