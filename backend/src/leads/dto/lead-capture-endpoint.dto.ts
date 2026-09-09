import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateLeadCaptureEndpointDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsEnum(['website_form', 'landing_page'])
  sourceType!: 'website_form' | 'landing_page';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceName?: string;

  @IsOptional()
  @IsMongoId()
  campaignId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  allowedOrigins?: string[];

  @IsOptional()
  @IsBoolean()
  requireConsent?: boolean;
}

export class UpdateLeadCaptureEndpointDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsEnum(['website_form', 'landing_page'])
  sourceType?: 'website_form' | 'landing_page';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sourceName?: string;

  @IsOptional()
  @IsMongoId()
  campaignId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  allowedOrigins?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsBoolean()
  requireConsent?: boolean;
}
