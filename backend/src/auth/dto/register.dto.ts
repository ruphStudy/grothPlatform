import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  confirmPassword?: string;

  @IsBoolean()
  termsAccepted: boolean;

  @IsString()
  termsVersion: string;

  @IsString()
  privacyVersion: string;

  @IsOptional()
  @IsString()
  selectedPlanKey?: string;
}
