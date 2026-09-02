import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNotEmpty, IsNumber, IsString, Max, Min, ValidateNested } from 'class-validator';
import { BUSINESS_MODELS } from '../schemas/product-intelligence-profile.schema';

export class TargetAudienceResultDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsArray()
  @IsString({ each: true })
  painPoints: string[];

  @IsArray()
  @IsString({ each: true })
  goals: string[];
}

export class ProductAnalysisResultDto {
  @IsString()
  @IsNotEmpty()
  summary: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsIn(BUSINESS_MODELS)
  businessModel: (typeof BUSINESS_MODELS)[number];

  @IsString()
  @IsNotEmpty()
  valueProposition: string;

  @IsArray()
  @IsString({ each: true })
  coreFeatures: string[];

  @IsArray()
  @IsString({ each: true })
  problemsSolved: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TargetAudienceResultDto)
  targetAudiences: TargetAudienceResultDto[];

  @IsArray()
  @IsString({ each: true })
  likelyUseCases: string[];

  @IsArray()
  @IsString({ each: true })
  differentiators: string[];

  @IsString()
  @IsNotEmpty()
  suggestedPositioning: string;

  @IsArray()
  @IsString({ each: true })
  marketingAngles: string[];

  @IsArray()
  @IsString({ each: true })
  missingInformation: string[];

  @IsNumber()
  @Min(0)
  @Max(100)
  confidenceScore: number;
}
