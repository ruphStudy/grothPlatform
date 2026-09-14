import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Campaign, CampaignSchema } from '../campaigns/schemas/campaign.schema';
import { CmsPublication, CmsPublicationSchema } from '../cms-integrations/schemas/cms-publication.schema';
import { ContentArtifact, ContentArtifactSchema } from '../content-generation/schemas/content-artifact.schema';
import { CrmOpportunity, CrmOpportunitySchema } from '../crm/schemas/crm-opportunity.schema';
import { EmailEvent, EmailEventSchema } from '../email/schemas/email-event.schema';
import { EmailMessage, EmailMessageSchema } from '../email/schemas/email-message.schema';
import { LeadSourceEvent, LeadSourceEventSchema } from '../leads/schemas/lead-source-event.schema';
import { Lead, LeadSchema } from '../leads/schemas/lead.schema';
import { ProductsModule } from '../products/products.module';
import { AttributionController } from './attribution.controller';
import { AttributionTouchpoint, AttributionTouchpointSchema } from './schemas/attribution-touchpoint.schema';
import { AttributionService } from './services/attribution.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AttributionTouchpoint.name, schema: AttributionTouchpointSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: LeadSourceEvent.name, schema: LeadSourceEventSchema },
      { name: CrmOpportunity.name, schema: CrmOpportunitySchema },
      { name: EmailMessage.name, schema: EmailMessageSchema },
      { name: EmailEvent.name, schema: EmailEventSchema },
      { name: CmsPublication.name, schema: CmsPublicationSchema },
      { name: ContentArtifact.name, schema: ContentArtifactSchema },
      { name: Campaign.name, schema: CampaignSchema },
    ]),
    ProductsModule,
  ],
  controllers: [AttributionController],
  providers: [AttributionService],
})
export class AttributionModule {}
