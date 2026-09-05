import { IsOptional, IsString } from 'class-validator';

export class RequestCampaignReviewChangesDto {
  @IsOptional()
  @IsString()
  note?: string;
}
