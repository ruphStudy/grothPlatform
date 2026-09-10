import { IsEmail, IsEnum, IsMongoId, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { EMAIL_PLATFORMS, EMAIL_PURPOSES, EMAIL_SENDER_TYPES } from '../types/email.types';
import type { EmailPlatform, EmailPurpose, EmailSenderType } from '../types/email.types';

export class CreateEmailConnectionDto {
  @IsEnum(EMAIL_PLATFORMS) platform!: EmailPlatform;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsObject() credential!: { apiKey?: string };
}

export class UpdateEmailCredentialDto {
  @IsObject() credential!: { apiKey?: string };
}

export class CreateEmailSenderDto {
  @IsMongoId() connectionId!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsEnum(EMAIL_SENDER_TYPES) type?: EmailSenderType;
}

export class TestEmailSendDto {
  @IsMongoId() connectionId!: string;
  @IsMongoId() senderId!: string;
  @IsEmail() recipientEmail!: string;
  @IsOptional() @IsString() @MaxLength(120) recipientName?: string;
  @IsString() @MinLength(1) @MaxLength(200) subject!: string;
  @IsOptional() @IsString() text?: string;
  @IsOptional() @IsString() html?: string;
  @IsOptional() @IsString() @MaxLength(320) replyTo?: string;
  @IsString() @MinLength(8) @MaxLength(200) idempotencyKey!: string;
  @IsOptional() @IsEnum(EMAIL_PURPOSES) purpose?: EmailPurpose;
}
