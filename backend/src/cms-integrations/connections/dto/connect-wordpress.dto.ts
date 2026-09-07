import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Only the safe, server-verifiable connection inputs are ever accepted —
// no provider API endpoint override (item 14), no site-side capability
// claim. Everything else is derived/validated server-side.
export class ConnectWordPressDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  siteUrl!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  username!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  applicationPassword!: string;
}
