import { IsString, MaxLength } from 'class-validator';

export class SelectPendingAccountDto {
  @IsString()
  @MaxLength(200)
  externalAccountId!: string;
}
