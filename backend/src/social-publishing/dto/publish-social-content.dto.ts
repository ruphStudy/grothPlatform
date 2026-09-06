import { IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const MAX_IDEMPOTENCY_KEY_CHARS = 128;

// Only safe, server-verifiable references are ever accepted — no post
// text, no access token, no provider payload, no externalAccountId, no
// platform override (item 17). Everything else is derived server-side
// from the persisted ContentVersion and the resolved SocialConnection.
export class PublishSocialContentDto {
  @IsMongoId()
  connectionId!: string;

  @IsOptional()
  @IsMongoId()
  creativeAssetId?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(MAX_IDEMPOTENCY_KEY_CHARS)
  idempotencyKey!: string;
}
