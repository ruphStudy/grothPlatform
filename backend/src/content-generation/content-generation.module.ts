import { Module } from '@nestjs/common';
import { ContentGenerationEngineService } from './engine/content-generation-engine.service';
import { OpenAiContentGenerationProvider } from './providers/openai-content-generation.provider';

// Infrastructure only — no controller. 15B-15I import this module and
// inject ContentGenerationEngineService to build content-type adapters.
@Module({
  providers: [ContentGenerationEngineService, OpenAiContentGenerationProvider],
  exports: [ContentGenerationEngineService],
})
export class ContentGenerationModule {}
