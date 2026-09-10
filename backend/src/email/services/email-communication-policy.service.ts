import { BadRequestException, Injectable } from '@nestjs/common';
import { CrmAccountService } from '../../crm/services/crm-account.service';
import type { EmailPurpose } from '../types/email.types';

@Injectable()
export class EmailCommunicationPolicyService {
  constructor(private readonly crmAccountService: CrmAccountService) {}

  async assertAllowedForLead(input: { organizationId: string; productId: string; leadId?: string; purpose: EmailPurpose }) {
    if (!input.leadId) return { allowed: true, eligibility: 'not_applicable' };
    if (input.purpose !== 'manual_crm' && input.purpose !== 'marketing') throw new BadRequestException('email_capability_unsupported');
    return this.crmAccountService.assertLeadCommunicationAllowed(input.organizationId, input.productId, input.leadId);
  }
}
