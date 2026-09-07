import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// Deliberately excludes siteUrl — reconnecting to a genuinely different
// site is a new connection (uniqueness is scoped by siteUrl, item 22),
// not an update to this one (item 26).
export class UpdateCmsConnectionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  username?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  applicationPassword?: string;
}
