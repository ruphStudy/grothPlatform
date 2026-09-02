import { Module } from '@nestjs/common';
import { DisabledResearchProvider } from './providers/disabled-research.provider';
import { ResearchService } from './research.service';

@Module({
  providers: [ResearchService, DisabledResearchProvider],
  exports: [ResearchService],
})
export class ResearchModule {}
