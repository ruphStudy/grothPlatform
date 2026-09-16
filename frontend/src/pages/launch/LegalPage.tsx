import { useEffect, useState } from 'react';
import { apiRequest } from '../../api/client';
import { Loading } from '../../components/Loading';
import { PublicLayout } from '../../components/launch/PublicLayout';
import type { LegalConfig } from '../../types';

const fallback: LegalConfig = {
  termsVersion: '2026-09',
  privacyVersion: '2026-09',
  legalEntityName: 'Your legal entity name',
  legalContactEmail: 'support@example.com',
  supportEmail: 'support@example.com',
};

export default function LegalPage({ type }: { type: 'terms' | 'privacy' }) {
  const [config, setConfig] = useState<LegalConfig | null>(null);

  useEffect(() => {
    apiRequest<LegalConfig>('/legal/config', { auth: false }).then(setConfig).catch(() => setConfig(fallback));
  }, []);

  if (!config) return <PublicLayout><section className="public-section"><Loading /></section></PublicLayout>;

  const version = type === 'terms' ? config.termsVersion : config.privacyVersion;
  return (
    <PublicLayout>
      <article className="legal-doc">
        <p className="eyebrow">Version {version}</p>
        <h1>{type === 'terms' ? 'Terms of Service' : 'Privacy Policy'}</h1>
        <p className="muted">Last updated: {version}. Contact: {config.legalContactEmail}. Entity: {config.legalEntityName}.</p>
        {type === 'terms' ? (
          <>
            {['Service description', 'Account responsibilities', 'Acceptable use', 'Subscription, billing, trial, and cancellation', 'User content and third-party integrations', 'AI-generated content disclaimer', 'Service availability', 'Intellectual property', 'Termination', 'Liability disclaimer', 'Changes to terms'].map((heading) => (
              <section key={heading}><h2>{heading}</h2><p>GIP provides AI-assisted growth planning, content, publishing, CRM, analytics, and approval workflows. Customers remain responsible for reviewing outputs, complying with applicable laws, managing connected providers, and approving external actions.</p></section>
            ))}
          </>
        ) : (
          <>
            {['Information collected', 'Account, Organization, and Product data', 'Usage analytics and local storage', 'AI provider processing', 'Payment processor', 'Third-party integrations', 'Security', 'Retention', 'User rights and request process', 'International and subprocessor note', 'Policy changes'].map((heading) => (
              <section key={heading}><h2>{heading}</h2><p>GIP uses the information needed to provide the service. Enabled AI, payment, email, social, CMS, and analytics providers may process relevant data for requested features. GIP does not store raw card numbers or CVV values.</p></section>
            ))}
          </>
        )}
        <p className="content-warning">Launch note: this template must be reviewed and approved by qualified legal counsel or the business owner before public production launch.</p>
      </article>
    </PublicLayout>
  );
}
