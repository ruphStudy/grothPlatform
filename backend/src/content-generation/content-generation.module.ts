import { Module } from '@nestjs/common';
import { ContentGenerationEngineService } from './engine/content-generation-engine.service';
import { OpenAiContentGenerationProvider } from './providers/openai-content-generation.provider';
import { ContentPromptBuilderService } from './prompting/content-prompt-builder.service';

// Infrastructure only — no controller. 15C-15I import this module and
// inject ContentPromptBuilderService + ContentGenerationEngineService to
// build content-type adapters.
@Module({
  providers: [ContentGenerationEngineService, OpenAiContentGenerationProvider, ContentPromptBuilderService],
  exports: [ContentGenerationEngineService, ContentPromptBuilderService],
})
export class ContentGenerationModule {}
