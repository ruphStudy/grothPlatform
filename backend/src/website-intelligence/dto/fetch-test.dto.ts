import { IsUrl } from 'class-validator';

export class FetchTestDto {
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  url: string;
}
