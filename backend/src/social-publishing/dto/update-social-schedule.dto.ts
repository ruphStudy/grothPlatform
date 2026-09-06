import { IsISO8601, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

// Deliberately excludes artifactId/version — the source ContentVersion of
// a schedule can never change (item 12); create a new schedule instead.
export class UpdateSocialScheduleDto {
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @IsOptional()
  @IsMongoId()
  connectionId?: string;

  @IsOptional()
  @IsMongoId()
  creativeAssetId?: string;
}
