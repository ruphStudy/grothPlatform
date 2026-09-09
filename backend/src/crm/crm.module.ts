import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { LeadIdentityConflict, LeadIdentityConflictSchema } from '../leads/schemas/lead-identity-conflict.schema';
import { LeadQualification, LeadQualificationSchema } from '../leads/schemas/lead-qualification.schema';
import { LeadSourceEvent, LeadSourceEventSchema } from '../leads/schemas/lead-source-event.schema';
import { Lead, LeadSchema } from '../leads/schemas/lead.schema';
import { LeadsModule } from '../leads/leads.module';
import { ProductsModule } from '../products/products.module';
import { CrmController } from './crm.controller';
import { CrmActivity, CrmActivitySchema } from './schemas/crm-activity.schema';
import { CrmConversionIdempotency, CrmConversionIdempotencySchema } from './schemas/crm-conversion-idempotency.schema';
import { CrmFollowUp, CrmFollowUpSchema } from './schemas/crm-follow-up.schema';
import { CrmOpportunity, CrmOpportunitySchema } from './schemas/crm-opportunity.schema';
import { CrmPipeline, CrmPipelineSchema } from './schemas/crm-pipeline.schema';
import { CrmStage, CrmStageSchema } from './schemas/crm-stage.schema';
import { CrmDashboardService } from './services/crm-dashboard.service';
import { CrmFollowUpService } from './services/crm-follow-up.service';
import { CrmOpportunityService } from './services/crm-opportunity.service';
import { CrmPipelineService } from './services/crm-pipeline.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CrmPipeline.name, schema: CrmPipelineSchema },
      { name: CrmStage.name, schema: CrmStageSchema },
      { name: CrmOpportunity.name, schema: CrmOpportunitySchema },
      { name: CrmActivity.name, schema: CrmActivitySchema },
      { name: CrmConversionIdempotency.name, schema: CrmConversionIdempotencySchema },
      { name: CrmFollowUp.name, schema: CrmFollowUpSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: LeadSourceEvent.name, schema: LeadSourceEventSchema },
      { name: LeadQualification.name, schema: LeadQualificationSchema },
      { name: LeadIdentityConflict.name, schema: LeadIdentityConflictSchema },
    ]),
    ProductsModule,
    CampaignsModule,
    LeadsModule,
  ],
  controllers: [CrmController],
  providers: [CrmPipelineService, CrmOpportunityService, CrmFollowUpService, CrmDashboardService],
  exports: [CrmPipelineService, CrmOpportunityService],
})
export class CrmModule {}
