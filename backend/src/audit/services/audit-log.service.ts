import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { redactSecrets } from '../../common/hardening/redaction.util';
import { AuditLogQueryDto } from '../dto/audit-log-query.dto';
import { AuditLog, AuditLogDocument } from '../schemas/audit-log.schema';

function oid(value?: string) {
  return value && Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : undefined;
}

@Injectable()
export class AuditLogService {
  constructor(@InjectModel(AuditLog.name) private readonly auditModel: Model<AuditLogDocument>) {}

  async record(input: {
    organizationId?: string;
    productId?: string;
    actorType: 'user' | 'system' | 'provider';
    actorUserId?: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    result: 'success' | 'failure';
    beforeSummary?: Record<string, unknown>;
    afterSummary?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    requestId?: string;
    ipHash?: string;
  }) {
    await this.auditModel.create({
      organizationId: oid(input.organizationId),
      productId: oid(input.productId),
      actorType: input.actorType,
      actorUserId: oid(input.actorUserId),
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      result: input.result,
      beforeSummary: redactSecrets(input.beforeSummary) as Record<string, unknown>,
      afterSummary: redactSecrets(input.afterSummary) as Record<string, unknown>,
      metadata: redactSecrets(input.metadata) as Record<string, unknown>,
      requestId: input.requestId,
      ipHash: input.ipHash,
      occurredAt: new Date(),
    });
  }

  async query(organizationId: string, dto: AuditLogQueryDto) {
    const page = Math.max(1, Number(dto.page || 1));
    const limit = Math.min(100, Math.max(1, Number(dto.limit || 25)));
    const filter: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId) };
    if (dto.action) filter.action = dto.action;
    if (dto.resourceType) filter.resourceType = dto.resourceType;
    if (dto.result && ['success', 'failure'].includes(dto.result)) filter.result = dto.result;
    if (dto.actorUserId && Types.ObjectId.isValid(dto.actorUserId)) filter.actorUserId = new Types.ObjectId(dto.actorUserId);
    if (dto.productId && Types.ObjectId.isValid(dto.productId)) filter.productId = new Types.ObjectId(dto.productId);
    if (dto.from || dto.to) filter.occurredAt = { ...(dto.from ? { $gte: new Date(dto.from) } : {}), ...(dto.to ? { $lte: new Date(dto.to) } : {}) };
    const [items, total] = await Promise.all([
      this.auditModel.find(filter).sort({ occurredAt: -1 }).skip((page - 1) * limit).limit(limit).lean().exec(),
      this.auditModel.countDocuments(filter).exec(),
    ]);
    return { items, page, limit, total };
  }
}
