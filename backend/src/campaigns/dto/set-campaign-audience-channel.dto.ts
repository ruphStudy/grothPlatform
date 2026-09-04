import { IsArray, IsOptional, IsString } from 'class-validator';

// Manual audience/channel mapping — always source='manual'. Primary values
// are validated against the selected arrays in the service, not here, since
// that's a cross-field check class-validator doesn't express cleanly.
export class SetCampaignAudienceChannelDto {
  @IsArray()
  @IsString({ each: true })
  audienceSegmentIds: string[];

  @IsArray()
  @IsString({ each: true })
  channelIds: string[];

  @IsOptional()
  @IsString()
  primaryAudienceSegmentId?: string;

  @IsOptional()
  @IsString()
  primaryChannel?: string;
}
