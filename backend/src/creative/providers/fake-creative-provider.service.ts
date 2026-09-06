import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { CreativeProvider } from './creative-provider.interface';
import type { CreativeProviderRequest, CreativeProviderResponse } from './creative-provider.types';

const DEFAULT_MODEL = 'fake-creative-v1';

// Deterministic, no-network stand-in used until a real image provider is
// wired in a later Creative sprint (17C+). Lets the engine, and 17B+
// feature code built on top of it, be developed and tested against the
// real CreativeProvider contract without any paid API call. Never invents
// usage/cost — those stay undefined exactly like a real provider that
// doesn't report them.
@Injectable()
export class FakeCreativeProvider implements CreativeProvider {
  readonly name = 'fake';

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    return true;
  }

  async generate(request: CreativeProviderRequest): Promise<CreativeProviderResponse> {
    const model = request.model ?? this.configService.get<string>('CREATIVE_MODEL') ?? DEFAULT_MODEL;
    return {
      asset: {
        type: 'image',
        url: `https://fake-creative.invalid/${randomUUID()}.png`,
        mimeType: 'image/png',
        width: request.width,
        height: request.height,
      },
      model,
    };
  }
}
