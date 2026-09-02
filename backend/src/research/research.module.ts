import { Module } from '@nestjs/common';
import { DisabledResearchProvider } from './providers/disabled-research.provider';
import { TavilyResearchProvider } from './providers/tavily-research.provider';
import { ResearchService } from './research.service';

@Module({
  providers: [ResearchService, DisabledResearchProvider, TavilyResearchProvider],
  exports: [ResearchService],
})
export class ResearchModule {}
