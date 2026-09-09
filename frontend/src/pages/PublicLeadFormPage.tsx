import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import type { PublicLeadCaptureFormConfig } from '../types';

function newSubmissionId(): string {
  return `form_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export default function PublicLeadFormPage() {
  const { publicKey } = useParams<{ publicKey: string }>();
  const [config, setConfig] = useState<PublicLeadCaptureFormConfig | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [submissionId, setSubmissionId] = useState(newSubmissionId);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const utm = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].map((key) => [key, params.get(key) ?? '']).filter(([, value]) => value));
  }, []);

  useEffect(() => {
    async function load() {
      if (!publicKey) return;
      setLoading(true);
      setError(null);
      try {
        setConfig(await apiRequest<PublicLeadCaptureFormConfig>(`/public/lead-forms/${publicKey}`, { auth: false }));
      } catch (err) {
        setError(err instanceof ApiError && err.status === 404 ? 'This form is not available.' : 'Unable to load this form.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [publicKey]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!publicKey || !config) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/public/lead-forms/${publicKey}/submit`, {
        method: 'POST',
        auth: false,
        body: { fields: values, consentAccepted, submissionId, pageUrl: window.location.href, referrerUrl: document.referrer, utm },
      });
      setSubmitted(true);
      setSubmissionId(newSubmissionId());
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? 'Too many submissions. Please try again later.' : 'Please check the form and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <main className="public-form-shell"><p>Loading...</p></main>;
  if (error && !config) return <main className="public-form-shell"><p>{error}</p></main>;
  if (!config) return null;

  if (submitted) {
    return (
      <main className="public-form-shell">
        <section className="public-form-panel">
          <h1>{config.successTitle || 'Thanks'}</h1>
          <p>{config.successMessage || 'Your details were submitted.'}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="public-form-shell">
      <form className="public-form-panel" onSubmit={submit}>
        <h1>{config.title}</h1>
        {config.description && <p>{config.description}</p>}
        {error && <p className="form-error">{error}</p>}
        {config.fields.map((field) => (
          <label key={field.key}>
            <span>{field.label}{field.required ? ' *' : ''}</span>
            {field.type === 'textarea' ? (
              <textarea required={field.required} placeholder={field.placeholder} value={String(values[field.key] ?? '')} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} />
            ) : field.type === 'select' ? (
              <select required={field.required} value={String(values[field.key] ?? '')} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}>
                <option value="">Select</option>
                {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : field.type === 'checkbox' ? (
              <input type="checkbox" checked={Boolean(values[field.key])} onChange={(e) => setValues({ ...values, [field.key]: e.target.checked })} />
            ) : (
              <input required={field.required} placeholder={field.placeholder} type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'} value={String(values[field.key] ?? '')} onChange={(e) => setValues({ ...values, [field.key]: e.target.value })} />
            )}
          </label>
        ))}
        {config.consent.enabled && <label className="public-form-check"><input required={config.consent.required} type="checkbox" checked={consentAccepted} onChange={(e) => setConsentAccepted(e.target.checked)} /> {config.consent.label || 'I agree to be contacted.'}</label>}
        <input type="text" name="website" value="" tabIndex={-1} autoComplete="off" style={{ display: 'none' }} readOnly />
        <button disabled={submitting}>{submitting ? 'Submitting...' : config.submitButtonText || 'Submit'}</button>
      </form>
    </main>
  );
}
