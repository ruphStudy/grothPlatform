import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lead, LeadDocument } from '../schemas/lead.schema';

export type LeadDeduplicationOutcome = 'new' | 'matched' | 'identity_conflict';

export interface LeadDeduplicationResult {
  outcome: LeadDeduplicationOutcome;
  lead?: LeadDocument;
  emailLead?: LeadDocument;
  phoneLead?: LeadDocument;
}

@Injectable()
export class LeadDeduplicationService {
  constructor(@InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>) {}

  async resolve(organizationId: string, productId: string, normalizedEmail?: string, normalizedPhone?: string): Promise<LeadDeduplicationResult> {
    const base = { organizationId: new Types.ObjectId(organizationId), productId: new Types.ObjectId(productId) };
    const [emailLead, phoneLead] = await Promise.all([
      normalizedEmail ? this.leadModel.findOne({ ...base, normalizedEmail }).exec() : Promise.resolve(null),
      normalizedPhone ? this.leadModel.findOne({ ...base, normalizedPhone }).exec() : Promise.resolve(null),
    ]);
    if (emailLead && phoneLead && emailLead._id.toString() !== phoneLead._id.toString()) {
      return { outcome: 'identity_conflict', emailLead, phoneLead };
    }
    const lead = emailLead ?? phoneLead ?? undefined;
    return lead ? { outcome: 'matched', lead } : { outcome: 'new' };
  }
}
