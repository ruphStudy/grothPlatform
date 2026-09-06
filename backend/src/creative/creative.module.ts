import { Module } from '@nestjs/common';
import { CreativeEngineService } from './engine/creative-engine.service';
import { CREATIVE_PROVIDER_TOKEN } from './providers/creative-provider.interface';
import { FakeCreativeProvider } from './providers/fake-creative-provider.service';

// 17A infrastructure only — no controller, no persistence. Future Creative
// features (17B+) inject CreativeEngineService and never the concrete
// provider. Once a real image provider is added (17C+), only this binding
// (driven by CREATIVE_PROVIDER) needs to change.
@Module({
  providers: [
    FakeCreativeProvider,
    { provide: CREATIVE_PROVIDER_TOKEN, useClass: FakeCreativeProvider },
    CreativeEngineService,
  ],
  exports: [CreativeEngineService],
})
export class CreativeModule {}
