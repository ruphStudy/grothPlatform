import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CrmModule } from '../crm/crm.module';
import { CrmAccount, CrmAccountSchema } from '../crm/schemas/crm-account.schema';
import { CrmActivity, CrmActivitySchema } from '../crm/schemas/crm-activity.schema';
import { CrmFollowUp, CrmFollowUpSchema } from '../crm/schemas/crm-follow-up.schema';
import { CrmOpportunity, CrmOpportunitySchema } from '../crm/schemas/crm-opportunity.schema';
import { LeadIdentityConflict, LeadIdentityConflictSchema } from '../leads/schemas/lead-identity-conflict.schema';
import { LeadQualification, LeadQualificationSchema } from '../leads/schemas/lead-qualification.schema';
import { Lead, LeadSchema } from '../leads/schemas/lead.schema';
import { ProductsModule } from '../products/products.module';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { CampaignsModule } from '../campaigns/campaigns.module';
import { EmailCredentialEncryptionService } from './connections/email-credential-encryption.service';
import { EmailController, EmailWebhookController, PublicEmailController } from './email.controller';
import { EmailEngineService } from './engine/email-engine.service';
import { EMAIL_PROVIDER_REGISTRY_TOKEN } from './providers/email-provider.tokens';
import type { EmailProvider } from './providers/email-provider.interface';
import { ResendEmailProvider } from './providers/resend-email.provider';
import { EmailCampaign, EmailCampaignSchema } from './schemas/email-campaign.schema';
import { EmailCampaignRecipient, EmailCampaignRecipientSchema } from './schemas/email-campaign-recipient.schema';
import { EmailConnection, EmailConnectionSchema } from './schemas/email-connection.schema';
import { EmailEvent, EmailEventSchema } from './schemas/email-event.schema';
import { EmailMessage, EmailMessageSchema } from './schemas/email-message.schema';
import { EmailSchedule, EmailScheduleSchema } from './schemas/email-schedule.schema';
import { EmailSequenceEnrollment, EmailSequenceEnrollmentSchema } from './schemas/email-sequence-enrollment.schema';
import { EmailSequenceExecution, EmailSequenceExecutionSchema } from './schemas/email-sequence-execution.schema';
import { EmailSequenceStep, EmailSequenceStepSchema } from './schemas/email-sequence-step.schema';
import { EmailSequence, EmailSequenceSchema } from './schemas/email-sequence.schema';
import { EmailSender, EmailSenderSchema } from './schemas/email-sender.schema';
import { EmailSuppression, EmailSuppressionSchema } from './schemas/email-suppression.schema';
import { EmailTemplate, EmailTemplateSchema } from './schemas/email-template.schema';
import { EmailTemplateVersion, EmailTemplateVersionSchema } from './schemas/email-template-version.schema';
import { EmailUnsubscribeToken, EmailUnsubscribeTokenSchema } from './schemas/email-unsubscribe-token.schema';
import { EmailAnalyticsService } from './services/email-analytics.service';
import { EmailCampaignService } from './services/email-campaign.service';
import { EmailCommunicationPolicyService } from './services/email-communication-policy.service';
import { EmailEventService } from './services/email-event.service';
import { EmailScheduleService } from './services/email-schedule.service';
import { EmailSequenceService } from './services/email-sequence.service';
import { EmailService } from './services/email.service';
import { EmailSuppressionService } from './services/email-suppression.service';
import { EmailTemplateRendererService } from './services/email-template-renderer.service';
import { EmailTemplateService } from './services/email-template.service';
import type { EmailPlatform } from './types/email.types';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EmailConnection.name, schema: EmailConnectionSchema },
      { name: EmailSender.name, schema: EmailSenderSchema },
      { name: EmailMessage.name, schema: EmailMessageSchema },
      { name: EmailTemplate.name, schema: EmailTemplateSchema },
      { name: EmailTemplateVersion.name, schema: EmailTemplateVersionSchema },
      { name: EmailCampaign.name, schema: EmailCampaignSchema },
      { name: EmailCampaignRecipient.name, schema: EmailCampaignRecipientSchema },
      { name: EmailSuppression.name, schema: EmailSuppressionSchema },
      { name: EmailUnsubscribeToken.name, schema: EmailUnsubscribeTokenSchema },
      { name: EmailSequence.name, schema: EmailSequenceSchema },
      { name: EmailSequenceStep.name, schema: EmailSequenceStepSchema },
      { name: EmailSequenceEnrollment.name, schema: EmailSequenceEnrollmentSchema },
      { name: EmailSequenceExecution.name, schema: EmailSequenceExecutionSchema },
      { name: EmailSchedule.name, schema: EmailScheduleSchema },
      { name: EmailEvent.name, schema: EmailEventSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: LeadQualification.name, schema: LeadQualificationSchema },
      { name: LeadIdentityConflict.name, schema: LeadIdentityConflictSchema },
      { name: CrmOpportunity.name, schema: CrmOpportunitySchema },
      { name: CrmAccount.name, schema: CrmAccountSchema },
      { name: CrmFollowUp.name, schema: CrmFollowUpSchema },
      { name: CrmActivity.name, schema: CrmActivitySchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    ProductsModule,
    CrmModule,
    CampaignsModule,
  ],
  controllers: [EmailController, PublicEmailController, EmailWebhookController],
  providers: [
    ResendEmailProvider,
    {
      provide: EMAIL_PROVIDER_REGISTRY_TOKEN,
      useFactory: (resend: ResendEmailProvider) => {
        const registry = new Map<EmailPlatform, EmailProvider>();
        registry.set('resend', resend);
        return registry;
      },
      inject: [ResendEmailProvider],
    },
    EmailCredentialEncryptionService,
    EmailEngineService,
    EmailCommunicationPolicyService,
    EmailTemplateRendererService,
    EmailTemplateService,
    EmailCampaignService,
    EmailSequenceService,
    EmailScheduleService,
    EmailSuppressionService,
    EmailEventService,
    EmailAnalyticsService,
    EmailService,
  ],
  exports: [EmailService, EmailEngineService],
})
export class EmailModule {}
