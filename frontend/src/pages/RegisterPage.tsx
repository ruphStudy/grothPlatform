import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, apiRequest } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ErrorMessage } from '../components/ErrorMessage';
import { PublicLayout } from '../components/launch/PublicLayout';
import type { LegalConfig } from '../types';

const fallbackLegal: LegalConfig = {
  termsVersion: '2026-09',
  privacyVersion: '2026-09',
  legalEntityName: 'Your legal entity name',
  legalContactEmail: 'support@example.com',
  supportEmail: 'support@example.com',
};

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [legal, setLegal] = useState<LegalConfig>(fallbackLegal);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedPlanKey = params.get('plan') || undefined;

  useEffect(() => {
    apiRequest<LegalConfig>('/legal/config', { auth: false }).then(setLegal).catch(() => setLegal(fallbackLegal));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!termsAccepted) {
      setError('You must agree to the Terms of Service and Privacy Policy.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await register({ firstName, lastName, email, password, confirmPassword, termsAccepted, termsVersion: legal.termsVersion, privacyVersion: legal.privacyVersion, selectedPlanKey });
      navigate(`/onboarding${selectedPlanKey ? `?plan=${encodeURIComponent(selectedPlanKey)}` : ''}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicLayout>
      <div className="auth-shell public-auth">
        <div className="auth-card">
          <div className="auth-brand">
            <span className="brand-title">GIP</span>
            <span className="brand-subtitle">Growth Intelligence Platform</span>
          </div>
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-subtitle">{selectedPlanKey ? `Selected plan: ${selectedPlanKey}` : 'Start a trial and set up your first product.'}</p>
          <form onSubmit={handleSubmit} className="form">
            <div className="form-grid-2">
              <div className="field">
                <label htmlFor="firstName">First Name</label>
                <input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div className="field">
                <label htmlFor="lastName">Last Name</label>
                <input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
            </div>
            <div className="field">
              <label htmlFor="confirmPassword">Confirm Password</label>
              <input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={6} required />
            </div>
            <label className="check-row">
              <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} />
              <span>I agree to the <Link to="/terms">Terms of Service</Link> and <Link to="/privacy">Privacy Policy</Link>.</span>
            </label>
            <p className="muted">Terms {legal.termsVersion} / Privacy {legal.privacyVersion}</p>
            <ErrorMessage message={error} />
            <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
              {loading ? 'Creating...' : 'Create Account'}
            </button>
          </form>
          <p className="auth-footer">Already have an account? <Link to="/login">Log in</Link></p>
        </div>
      </div>
    </PublicLayout>
  );
}
