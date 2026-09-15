import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CmsPublication, CmsPublicationSchema } from '../cms-integrations/schemas/cms-publication.schema';
import { ContentVersion, ContentVersionSchema } from '../content-generation/schemas/content-version.schema';
import { ContentHumanReviewResult, ContentHumanReviewResultSchema } from '../content-generation/schemas/content-human-review-result.schema';
import { CreativeAsset, CreativeAssetSchema } from '../creative/schemas/creative-asset.schema';
import { EmailCampaign, EmailCampaignSchema } from '../email/schemas/email-campaign.schema';
import { EmailSchedule, EmailScheduleSchema } from '../email/schemas/email-schedule.schema';
import { GrowthDecisionRun, GrowthDecisionRunSchema, WeeklyGrowthPlan, WeeklyGrowthPlanSchema } from '../growth-brain/schemas/growth-brain.schema';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsModule } from '../products/products.module';
import { SocialPublication, SocialPublicationSchema } from '../social-publishing/schemas/social-publication.schema';
import { TeamModule } from '../team/team.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ApprovalsController } from './approvals.controller';
import { ApprovalDecision, ApprovalDecisionSchema, ApprovalEmailNotificationLog, ApprovalEmailNotificationLogSchema, ApprovalRequest, ApprovalRequestSchema } from './schemas/approval.schema';
import { ApprovalNotificationService } from './services/approval-notification.service';
import { ApprovalWorkflowService } from './services/approval-workflow.service';

@Module({
  imports: [
    ProductsModule,
    NotificationsModule,
    TeamModule,
    MongooseModule.forFeature([
      { name: ApprovalRequest.name, schema: ApprovalRequestSchema },
      { name: ApprovalDecision.name, schema: ApprovalDecisionSchema },
      { name: ApprovalEmailNotificationLog.name, schema: ApprovalEmailNotificationLogSchema },
      { name: ContentVersion.name, schema: ContentVersionSchema },
      { name: ContentHumanReviewResult.name, schema: ContentHumanReviewResultSchema },
      { name: CreativeAsset.name, schema: CreativeAssetSchema },
      { name: SocialPublication.name, schema: SocialPublicationSchema },
      { name: CmsPublication.name, schema: CmsPublicationSchema },
      { name: EmailCampaign.name, schema: EmailCampaignSchema },
      { name: EmailSchedule.name, schema: EmailScheduleSchema },
      { name: WeeklyGrowthPlan.name, schema: WeeklyGrowthPlanSchema },
      { name: GrowthDecisionRun.name, schema: GrowthDecisionRunSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ApprovalsController],
  providers: [ApprovalWorkflowService, ApprovalNotificationService],
  exports: [ApprovalWorkflowService],
})
export class ApprovalsModule {}
