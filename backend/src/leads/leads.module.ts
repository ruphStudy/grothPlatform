import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { ProductsModule } from '../products/products.module';
import { CrmOpportunity, CrmOpportunitySchema } from '../crm/schemas/crm-opportunity.schema';
import { LeadCaptureEndpointsController, PublicLeadCaptureController } from './lead-capture-endpoints.controller';
import { LeadCaptureFormsController, PublicLeadCaptureFormsController } from './lead-capture-forms.controller';
import { LeadsController } from './leads.controller';
import { LeadCaptureEndpoint, LeadCaptureEndpointSchema } from './schemas/lead-capture-endpoint.schema';
import { LeadCaptureForm, LeadCaptureFormSchema } from './schemas/lead-capture-form.schema';
import { LeadIdentityConflict, LeadIdentityConflictSchema } from './schemas/lead-identity-conflict.schema';
import { LeadQualification, LeadQualificationSchema } from './schemas/lead-qualification.schema';
import { LeadSourceEvent, LeadSourceEventSchema } from './schemas/lead-source-event.schema';
import { LeadSubmissionIdempotency, LeadSubmissionIdempotencySchema } from './schemas/lead-submission-idempotency.schema';
import { Lead, LeadSchema } from './schemas/lead.schema';
import { LeadCaptureEndpointsService } from './services/lead-capture-endpoints.service';
import { LeadCaptureFormsService } from './services/lead-capture-forms.service';
import { LeadCaptureService } from './services/lead-capture.service';
import { LeadDashboardService } from './services/lead-dashboard.service';
import { LeadDeduplicationService } from './services/lead-deduplication.service';
import { LeadNormalizationService } from './services/lead-normalization.service';
import { LeadQualificationService } from './services/lead-qualification.service';
import { LeadsService } from './services/leads.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Lead.name, schema: LeadSchema },
      { name: LeadSourceEvent.name, schema: LeadSourceEventSchema },
      { name: LeadCaptureEndpoint.name, schema: LeadCaptureEndpointSchema },
      { name: LeadCaptureForm.name, schema: LeadCaptureFormSchema },
      { name: CrmOpportunity.name, schema: CrmOpportunitySchema },
      { name: LeadIdentityConflict.name, schema: LeadIdentityConflictSchema },
      { name: LeadQualification.name, schema: LeadQualificationSchema },
      { name: LeadSubmissionIdempotency.name, schema: LeadSubmissionIdempotencySchema },
    ]),
    ProductsModule,
    CampaignsModule,
  ],
  controllers: [LeadsController, LeadCaptureEndpointsController, LeadCaptureFormsController, PublicLeadCaptureController, PublicLeadCaptureFormsController],
  providers: [LeadNormalizationService, LeadDeduplicationService, LeadQualificationService, LeadCaptureService, LeadsService, LeadCaptureEndpointsService, LeadCaptureFormsService, LeadDashboardService],
  exports: [LeadCaptureService, LeadsService, LeadQualificationService],
})
export class LeadsModule {}
