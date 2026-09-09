import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { ProductsModule } from '../products/products.module';
import { LeadCaptureEndpointsController, PublicLeadCaptureController } from './lead-capture-endpoints.controller';
import { LeadsController } from './leads.controller';
import { LeadCaptureEndpoint, LeadCaptureEndpointSchema } from './schemas/lead-capture-endpoint.schema';
import { LeadIdentityConflict, LeadIdentityConflictSchema } from './schemas/lead-identity-conflict.schema';
import { LeadSourceEvent, LeadSourceEventSchema } from './schemas/lead-source-event.schema';
import { LeadSubmissionIdempotency, LeadSubmissionIdempotencySchema } from './schemas/lead-submission-idempotency.schema';
import { Lead, LeadSchema } from './schemas/lead.schema';
import { LeadCaptureEndpointsService } from './services/lead-capture-endpoints.service';
import { LeadCaptureService } from './services/lead-capture.service';
import { LeadDeduplicationService } from './services/lead-deduplication.service';
import { LeadNormalizationService } from './services/lead-normalization.service';
import { LeadsService } from './services/leads.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: LeadSourceEvent.name, schema: LeadSourceEventSchema },
      { name: LeadCaptureEndpoint.name, schema: LeadCaptureEndpointSchema },
      { name: LeadIdentityConflict.name, schema: LeadIdentityConflictSchema },
      { name: LeadSubmissionIdempotency.name, schema: LeadSubmissionIdempotencySchema },
    ]),
    ProductsModule,
    CampaignsModule,
  ],
  controllers: [LeadsController, LeadCaptureEndpointsController, PublicLeadCaptureController],
  providers: [LeadNormalizationService, LeadDeduplicationService, LeadCaptureService, LeadsService, LeadCaptureEndpointsService],
  exports: [LeadCaptureService, LeadsService],
})
export class LeadsModule {}
