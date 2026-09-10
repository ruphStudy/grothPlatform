import { BadRequestException, Injectable } from '@nestjs/common';
import { EmailTemplateVersionDocument } from '../schemas/email-template-version.schema';

export interface EmailRenderContext {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  companyName?: string;
  jobTitle?: string;
  productName?: string;
  campaignName?: string;
  opportunityName?: string;
  accountName?: string;
  senderName?: string;
  unsubscribeUrl?: string;
}

const ALLOWED_VARIABLES = ['firstName', 'lastName', 'fullName', 'email', 'companyName', 'jobTitle', 'productName', 'campaignName', 'opportunityName', 'accountName', 'senderName', 'unsubscribeUrl'];
const TOKEN_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)(?:\|([^}]*))?\s*\}\}/g;

@Injectable()
export class EmailTemplateRendererService {
  allowedVariables = ALLOWED_VARIABLES;

  extractVariables(...templates: Array<string | undefined>) {
    const variables = new Set<string>();
    for (const template of templates) {
      if (!template) continue;
      for (const match of template.matchAll(TOKEN_RE)) {
        if (!ALLOWED_VARIABLES.includes(match[1])) throw new BadRequestException('email_template_variable_unsupported');
        variables.add(match[1]);
      }
      if (/\{\{/.test(template.replace(TOKEN_RE, ''))) throw new BadRequestException('email_template_variable_unsupported');
    }
    return [...variables].sort();
  }

  render(version: EmailTemplateVersionDocument | { subjectTemplate: string; htmlTemplate?: string; textTemplate?: string; previewText?: string; variables?: string[] }, context: EmailRenderContext) {
    const missingVariables = new Set<string>();
    const renderOne = (template?: string) => template?.replace(TOKEN_RE, (_raw, name: string, fallback: string | undefined) => {
      if (!ALLOWED_VARIABLES.includes(name)) throw new BadRequestException('email_template_variable_unsupported');
      const value = context[name as keyof EmailRenderContext];
      if (value !== undefined && value !== null && String(value).length > 0) return String(value);
      if (fallback !== undefined) return fallback;
      missingVariables.add(name);
      return '';
    });
    const rendered = {
      subject: renderOne(version.subjectTemplate)?.trim() ?? '',
      html: this.sanitizeHtml(renderOne(version.htmlTemplate)),
      text: renderOne(version.textTemplate),
      previewText: renderOne(version.previewText),
      missingVariables: [...missingVariables].sort(),
      warnings: [] as string[],
    };
    if (!rendered.subject) rendered.missingVariables.push('subject');
    return rendered;
  }

  sanitizeHtml(html?: string) {
    if (!html) return undefined;
    if (/<script[\s>]/i.test(html) || /javascript:/i.test(html) || /<iframe[\s>]/i.test(html) || /<object[\s>]/i.test(html)) throw new BadRequestException('email_content_invalid');
    return html;
  }
}
