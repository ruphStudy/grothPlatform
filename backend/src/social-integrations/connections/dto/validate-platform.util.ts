import { BadRequestException } from '@nestjs/common';
import { SOCIAL_PLATFORMS } from '../../types/social.types';
import type { SocialPlatform } from '../../types/social.types';

export function parsePlatformParam(value: string): SocialPlatform {
  if (!SOCIAL_PLATFORMS.includes(value as SocialPlatform)) {
    throw new BadRequestException(`Unsupported social platform: ${value}`);
  }
  return value as SocialPlatform;
}
