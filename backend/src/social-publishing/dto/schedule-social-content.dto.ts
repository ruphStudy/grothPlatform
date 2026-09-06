import { IsISO8601, IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const MAX_IDEMPOTENCY_KEY_CHARS = 128;

// Only safe, server-verifiable references + the user's scheduling intent
// are ever accepted — no post text, no access token, no provider payload,
// no platform override (item 4). Everything else is derived server-side.
export class ScheduleSocialContentDto {
  @IsMongoId()
  connectionId!: string;

  @IsOptional()
  @IsMongoId()
  creativeAssetId?: string;

  @IsISO8601()
  scheduledAt!: string;

  @IsString()
  @MaxLength(100)
  timezone!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(MAX_IDEMPOTENCY_KEY_CHARS)
  idempotencyKey!: string;
}
