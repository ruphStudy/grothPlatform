import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CmsPublication, CmsPublicationDocument } from '../../cms-integrations/schemas/cms-publication.schema';
import { ContentVersion, ContentVersionDocument } from '../../content-generation/schemas/content-version.schema';
import { ContentHumanReviewResult, ContentHumanReviewResultDocument } from '../../content-generation/schemas/content-human-review-result.schema';
import { CreativeAsset, CreativeAssetDocument } from '../../creative/schemas/creative-asset.schema';
import { EmailCampaign, EmailCampaignDocument } from '../../email/schemas/email-campaign.schema';
import { EmailSchedule, EmailScheduleDocument } from '../../email/schemas/email-schedule.schema';
import { GrowthDecisionRun, GrowthDecisionRunDocument, WeeklyGrowthPlan, WeeklyGrowthPlanDocument } from '../../growth-brain/schemas/growth-brain.schema';
import { ProductsService } from '../../products/products.service';
import { AuthorizationService } from '../../team/services/team.service';
import { OrganizationMember, OrganizationMemberDocument, PERMISSIONS } from '../../team/schemas/team.schema';
import { SocialPublication, SocialPublicationDocument } from '../../social-publishing/schemas/social-publication.schema';
import { User, UserDocument } from '../../users/schemas/user.schema';
import { CreateApprovalRequestDto, ApprovalDecisionDto, ApprovalQueueQueryDto } from '../dto/approval.dto';
import {
  ApprovalDecision,
  ApprovalDecisionDocument,
  ApprovalPolicy,
  ApprovalRequest,
  ApprovalRequestDocument,
  ApprovalRequestStatus,
  ApprovalTargetType,
} from '../schemas/approval.schema';
import { ApprovalNotificationService } from './approval-notification.service';

const ACTIVE_STATUSES: ApprovalRequestStatus[] = ['pending', 'changes_requested'];
const PRIORITY_WEIGHT: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

@Injectable()
export class ApprovalWorkflowService {
  constructor(
    @InjectModel(ApprovalRequest.name) private readonly requestModel: Model<ApprovalRequestDocument>,
    @InjectModel(ApprovalDecision.name) private readonly decisionModel: Model<ApprovalDecisionDocument>,
    @InjectModel(ContentVersion.name) private readonly contentVersionModel: Model<ContentVersionDocument>,
    @InjectModel(ContentHumanReviewResult.name) private readonly humanReviewModel: Model<ContentHumanReviewResultDocument>,
    @InjectModel(CreativeAsset.name) private readonly creativeAssetModel: Model<CreativeAssetDocument>,
    @InjectModel(SocialPublication.name) private readonly socialPublicationModel: Model<SocialPublicationDocument>,
    @InjectModel(CmsPublication.name) private readonly cmsPublicationModel: Model<CmsPublicationDocument>,
    @InjectModel(EmailCampaign.name) private readonly emailCampaignModel: Model<EmailCampaignDocument>,
    @InjectModel(EmailSchedule.name) private readonly emailScheduleModel: Model<EmailScheduleDocument>,
    @InjectModel(WeeklyGrowthPlan.name) private readonly weeklyPlanModel: Model<WeeklyGrowthPlanDocument>,
    @InjectModel(GrowthDecisionRun.name) private readonly growthDecisionModel: Model<GrowthDecisionRunDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(OrganizationMember.name) private readonly memberModel: Model<OrganizationMemberDocument>,
    private readonly productsService: ProductsService,
    private readonly notifications: ApprovalNotificationService,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async create(organizationId: string, productId: string, userId: string, dto: CreateApprovalRequestDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    await this.authorizationService.assertPermission(organizationId, userId, PERMISSIONS.APPROVAL_REQUEST, productId);
    const target = await this.resolveTarget(organizationId, productId, dto.targetType as ApprovalTargetType, dto.targetId, dto.targetVersionId);
    const existing = await this.requestModel.findOne({
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      targetType: dto.targetType,
      targetId: dto.targetId,
      targetVersionId: target.snapshot.targetVersionId,
      status: { $in: ACTIVE_STATUSES },
    } as any).exec();
    if (existing) return this.withHistory(existing);
    const policy = (dto.approvalPolicy as ApprovalPolicy | undefined) || target.policy;
    const reviewerIds = await this.resolveReviewers(organizationId, productId, userId);
    const request = await new this.requestModel({
      organizationId: new Types.ObjectId(organizationId),
      productId: new Types.ObjectId(productId),
      targetType: dto.targetType,
      targetId: dto.targetId,
      targetVersionId: target.snapshot.targetVersionId,
      requestedByUserId: new Types.ObjectId(userId),
      reasonCode: dto.reasonCode || target.reasonCode,
      reasonText: this.safe(dto.reasonText || target.reasonText || ''),
      status: 'pending',
      priority: dto.priority || target.priority,
      approvalPolicy: policy,
      reviewerUserIds: reviewerIds,
      targetSnapshot: target.snapshot,
      requestedAt: new Date(),
      dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
    }).save();
    await this.appendDecision(request, 'requested', userId, dto.reasonText, 'pending', { eventType: 'requested' });
    await this.notifications.dispatch('approval_requested', request, userId, dto.reasonText);
    return this.withHistory(request);
  }

  async detail(organizationId: string, productId: string, userId: string, approvalId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    await this.authorizationService.assertPermission(organizationId, userId, PERMISSIONS.APPROVAL_VIEW, productId);
    const request = await this.findRequest(organizationId, productId, approvalId);
    return this.withHistory(request);
  }

  async approve(organizationId: string, productId: string, userId: string, approvalId: string, dto: ApprovalDecisionDto) {
    const request = await this.transition(organizationId, productId, userId, approvalId, 'approved', dto.comment);
    await this.onApproved(request);
    await this.notifications.dispatch('approval_approved', request, userId, dto.comment);
    return this.withHistory(request);
  }

  async reject(organizationId: string, productId: string, userId: string, approvalId: string, dto: ApprovalDecisionDto) {
    const request = await this.transition(organizationId, productId, userId, approvalId, 'rejected', dto.comment);
    await this.notifications.dispatch('approval_rejected', request, userId, dto.comment);
    return this.withHistory(request);
  }

  async requestChanges(organizationId: string, productId: string, userId: string, approvalId: string, dto: ApprovalDecisionDto) {
    const request = await this.transition(organizationId, productId, userId, approvalId, 'changes_requested', dto.comment);
    await this.notifications.dispatch('approval_changes_requested', request, userId, dto.comment);
    return this.withHistory(request);
  }

  async cancel(organizationId: string, productId: string, userId: string, approvalId: string, dto: ApprovalDecisionDto) {
    return this.withHistory(await this.transition(organizationId, productId, userId, approvalId, 'cancelled', dto.comment));
  }

  async status(organizationId: string, productId: string, userId: string, targetType: string, targetId: string, targetVersionId?: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    await this.authorizationService.assertPermission(organizationId, userId, PERMISSIONS.APPROVAL_VIEW, productId);
    const target = await this.resolveTarget(organizationId, productId, targetType as ApprovalTargetType, targetId, targetVersionId);
    const request = await this.requestModel.findOne({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), targetType, targetId, targetVersionId: target.snapshot.targetVersionId } as any).sort({ requestedAt: -1 }).lean().exec();
    return {
      required: target.policy === 'required',
      policy: target.policy,
      status: request?.status || 'not_requested',
      approvalRequestId: request?._id?.toString(),
      requestedAt: request?.requestedAt,
      resolvedAt: request?.resolvedAt,
      latestDecision: request?.currentDecisionId,
    };
  }

  async assertApprovedForExternalAction(organizationId: string, productId: string, targetType: ApprovalTargetType, targetId: string, targetVersionId?: string, override?: { actorUserId: string; reason: string }) {
    const target = await this.resolveTarget(organizationId, productId, targetType, targetId, targetVersionId);
    if (target.policy === 'optional') return { approved: true, policy: 'optional' };
    const request = await this.requestModel.findOne({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), targetType, targetId, targetVersionId: target.snapshot.targetVersionId } as any).sort({ requestedAt: -1 }).exec();
    if (target.policy === 'recommended' && override?.actorUserId && override.reason) {
      if (request) await this.appendDecision(request, 'recommended_override', override.actorUserId, override.reason, request.status, { override: true });
      return { approved: true, policy: 'recommended', override: true };
    }
    if (!request || request.status !== 'approved') throw new ConflictException('approval_required_for_external_action');
    return { approved: true, policy: target.policy, approvalRequestId: request._id.toString() };
  }

  async queue(organizationId: string, productId: string, userId: string, query: ApprovalQueueQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    await this.authorizationService.assertPermission(organizationId, userId, PERMISSIONS.APPROVAL_VIEW, productId);
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(query.limit || 20)));
    const filter = this.queueFilter(organizationId, productId, query);
    const [items, total, counts] = await Promise.all([
      this.requestModel.find(filter).sort({ priority: 1, requestedAt: 1 }).skip((page - 1) * limit).limit(limit).lean().exec(),
      this.requestModel.countDocuments(filter).exec(),
      this.counts(organizationId, productId),
    ]);
    const sorted = items.sort((a, b) => (PRIORITY_WEIGHT[a.priority] ?? 2) - (PRIORITY_WEIGHT[b.priority] ?? 2) || new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime());
    return { items: sorted.map((item) => ({ ...item, overdue: !!item.dueAt && new Date(item.dueAt).getTime() < Date.now() && ['pending', 'changes_requested'].includes(item.status) })), page, limit, total, counts };
  }

  async history(organizationId: string, productId: string, userId: string, approvalId: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    await this.authorizationService.assertPermission(organizationId, userId, PERMISSIONS.APPROVAL_VIEW, productId);
    await this.findRequest(organizationId, productId, approvalId);
    return this.decisionModel.find({ organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId), approvalRequestId: new Types.ObjectId(approvalId) }).sort({ decidedAt: 1 }).lean().exec();
  }

  async productHistory(organizationId: string, productId: string, userId: string, query: ApprovalQueueQueryDto) {
    await this.productsService.findOne(organizationId, productId, userId);
    await this.authorizationService.assertPermission(organizationId, userId, PERMISSIONS.APPROVAL_VIEW, productId);
    const filter: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) };
    if (query.targetType) filter['metadata.targetType'] = query.targetType;
    if (query.status) filter.resultingStatus = query.status;
    if (query.from || query.to) filter.decidedAt = { ...(query.from ? { $gte: new Date(query.from) } : {}), ...(query.to ? { $lte: new Date(query.to) } : {}) };
    return this.decisionModel.find(filter).sort({ decidedAt: -1 }).limit(Math.min(100, Number(query.limit || 50))).lean().exec();
  }

  private async transition(organizationId: string, productId: string, userId: string, approvalId: string, resultingStatus: ApprovalRequestStatus, comment?: string) {
    await this.productsService.findOne(organizationId, productId, userId);
    await this.authorizationService.assertPermission(organizationId, userId, PERMISSIONS.APPROVAL_DECIDE, productId);
    const request = await this.findRequest(organizationId, productId, approvalId);
    if (['approved', 'rejected', 'cancelled', 'expired'].includes(request.status) && resultingStatus !== 'cancelled') throw new ConflictException('approval_request_already_resolved');
    const previousStatus = request.status;
    request.status = resultingStatus;
    request.resolvedAt = resultingStatus === 'changes_requested' ? undefined : new Date();
    const decision = await this.appendDecision(request, resultingStatus, userId, comment, previousStatus, { targetType: request.targetType, targetId: request.targetId });
    request.currentDecisionId = decision._id;
    await request.save();
    return request;
  }

  private async appendDecision(request: ApprovalRequestDocument, decision: string, userId: string, comment: string | undefined, previousStatus: ApprovalRequestStatus, metadata: Record<string, unknown>) {
    return new this.decisionModel({
      organizationId: request.organizationId,
      productId: request.productId,
      approvalRequestId: request._id,
      decision: decision as any,
      decidedByUserId: new Types.ObjectId(userId),
      comment: this.safe(comment || ''),
      decidedAt: new Date(),
      previousStatus,
      resultingStatus: request.status,
      metadata,
    }).save();
  }

  private async resolveTarget(organizationId: string, productId: string, targetType: ApprovalTargetType, targetId: string, targetVersionId?: string) {
    if (!Types.ObjectId.isValid(targetId)) throw new BadRequestException('invalid_target_id');
    const match = { _id: new Types.ObjectId(targetId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) };
    if (targetType === 'content_version') {
      const target = await this.contentVersionModel.findOne(match).lean().exec();
      if (!target) throw new NotFoundException('approval_target_not_found');
      const human = await this.humanReviewModel.findOne({ organizationId: match.organizationId, productId: match.productId, contentVersionId: target._id }).lean().exec();
      const policy: ApprovalPolicy = human?.decision === 'review_required' ? 'required' : human?.decision === 'review_recommended' ? 'recommended' : 'optional';
      return { policy, priority: policy === 'required' ? 'high' : 'normal', reasonCode: human?.decision || 'content_approval', reasonText: human?.reasons?.map((r: any) => r.reason).join(' ') || '', snapshot: this.snapshot('content_version', targetId, String(target.version), target.kind, `Content version ${target.version} for ${target.kind}.`, 'generated', { artifactId: target.artifactId?.toString(), humanReviewDecision: human?.decision }) };
    }
    const record = await this.modelFor(targetType).findOne(match).lean().exec();
    if (!record) throw new NotFoundException('approval_target_not_found');
    if (targetVersionId && String(record.version || record.contentVersion || record.emailTemplateVersion || record.templateVersion || '') !== targetVersionId && !['weekly_growth_plan', 'growth_decision', 'strategy_adjustment'].includes(targetType)) throw new ConflictException('approval_target_version_mismatch');
    const title = record.name || record.title || record.objective || record.targetSnapshot?.title || `${targetType} ${targetId}`;
    const status = record.status || 'current';
    const version = targetVersionId || String(record.version || record.contentVersion || record.emailTemplateVersion || record.templateVersion || record.strategyVersion || record.weekStart || '');
    const policy: ApprovalPolicy = ['social_publication', 'cms_publication', 'email_campaign', 'email_schedule', 'weekly_growth_plan'].includes(targetType) ? 'required' : 'recommended';
    return { policy, priority: policy === 'required' ? 'high' : 'normal', reasonCode: `${targetType}_approval`, reasonText: 'Formal approval is required before protected action.', snapshot: this.snapshot(targetType, targetId, version || undefined, title, `${title} is waiting for formal approval.`, status, { version }) };
  }

  private modelFor(targetType: ApprovalTargetType): Model<any> {
    const map: Record<string, Model<any>> = {
      creative_asset: this.creativeAssetModel,
      social_publication: this.socialPublicationModel,
      cms_publication: this.cmsPublicationModel,
      email_campaign: this.emailCampaignModel,
      email_schedule: this.emailScheduleModel,
      weekly_growth_plan: this.weeklyPlanModel,
      growth_decision: this.growthDecisionModel,
    };
    const model = map[targetType];
    if (!model) throw new BadRequestException('approval_target_type_not_supported');
    return model;
  }

  private snapshot(targetType: ApprovalTargetType, targetId: string, targetVersionId: string | undefined, title: string, summary: string, statusAtRequest: string, relevantMetadata: Record<string, unknown>) {
    return { title: this.safe(title).slice(0, 300), summary: this.safe(summary).slice(0, 1000), targetType, targetId, targetVersionId, statusAtRequest, relevantMetadata };
  }

  private async resolveReviewers(organizationId: string, productId: string, userId: string) {
    const user = await this.userModel.findOne({ _id: new Types.ObjectId(userId), status: 'active' }).select('_id').lean().exec();
    if (!user) throw new ForbiddenException('approval_actor_not_found');
    const members = await this.memberModel
      .find({ organizationId: new Types.ObjectId(organizationId), status: 'active' })
      .select('userId')
      .lean()
      .exec();
    const reviewerIds: string[] = [];
    for (const member of members) {
      const memberUserId = member.userId.toString();
      const access = await this.authorizationService.access(organizationId, memberUserId, productId);
      if (access.permissions.includes(PERMISSIONS.APPROVAL_DECIDE)) reviewerIds.push(memberUserId);
    }
    return Array.from(new Set(reviewerIds));
  }

  private async findRequest(organizationId: string, productId: string, approvalId: string) {
    const request = await this.requestModel.findOne({ _id: new Types.ObjectId(approvalId), organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) }).exec();
    if (!request) throw new NotFoundException('approval_request_not_found');
    return request;
  }

  private async withHistory(request: ApprovalRequestDocument) {
    const history = await this.decisionModel.find({ approvalRequestId: request._id }).sort({ decidedAt: 1 }).lean().exec();
    return { ...(request.toObject ? request.toObject() : request), history };
  }

  private queueFilter(organizationId: string, productId: string, query: ApprovalQueueQueryDto) {
    const filter: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) };
    filter.status = query.status || { $in: ['pending', 'changes_requested'] };
    if (query.targetType) filter.targetType = query.targetType;
    if (query.priority) filter.priority = query.priority;
    if (query.policy) filter.approvalPolicy = query.policy;
    if (query.requestedBy && Types.ObjectId.isValid(query.requestedBy)) filter.requestedByUserId = new Types.ObjectId(query.requestedBy);
    if (query.from || query.to) filter.requestedAt = { ...(query.from ? { $gte: new Date(query.from) } : {}), ...(query.to ? { $lte: new Date(query.to) } : {}) };
    return filter;
  }

  private async counts(organizationId: string, productId: string) {
    const base = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) };
    const [pending, highPriority, overdue, changesRequested] = await Promise.all([
      this.requestModel.countDocuments({ ...base, status: 'pending' }).exec(),
      this.requestModel.countDocuments({ ...base, status: { $in: ACTIVE_STATUSES }, priority: { $in: ['high', 'urgent'] } } as any).exec(),
      this.requestModel.countDocuments({ ...base, status: { $in: ACTIVE_STATUSES }, dueAt: { $lt: new Date() } } as any).exec(),
      this.requestModel.countDocuments({ ...base, status: 'changes_requested' }).exec(),
    ]);
    return { pending, highPriority, overdue, changesRequested };
  }

  private async onApproved(request: ApprovalRequestDocument) {
    if (request.targetType === 'weekly_growth_plan') {
      await this.weeklyPlanModel.updateOne({ _id: new Types.ObjectId(request.targetId), organizationId: request.organizationId, productId: request.productId }, { $set: { status: 'approved' } }).exec();
    }
  }

  private safe(value: string) {
    return String(value || '').replace(/[<>]/g, '').slice(0, 2000);
  }
}
