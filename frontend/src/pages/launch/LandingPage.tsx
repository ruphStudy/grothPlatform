import { Link } from 'react-router-dom';
import { PublicLayout } from '../../components/launch/PublicLayout';

export default function LandingPage() {
  return (
    <PublicLayout>
      <section className="launch-hero">
        <div>
          <p className="eyebrow">AI-assisted growth operations</p>
          <h1>Growth Intelligence Platform</h1>
          <p>Plan campaigns, create grounded content, manage leads, track attribution, and keep approvals human-controlled from one product workspace.</p>
          <div className="public-actions">
            <Link className="btn btn-primary" to="/signup">Start Trial</Link>
            <Link className="btn btn-secondary" to="/pricing">View Pricing</Link>
          </div>
        </div>
      </section>
      <section className="public-section">
        <h2>What GIP does</h2>
        <div className="public-grid">
          {['Product and market intelligence', 'Growth strategy and campaigns', 'Content, creative, CMS, and social publishing', 'Leads, CRM, analytics, attribution, and approvals'].map((item) => (
            <div className="public-tile" key={item}>{item}</div>
          ))}
        </div>
      </section>
      <section className="public-section">
        <h2>How it works</h2>
        <div className="public-grid">
          <div className="public-tile">Create an organization and product.</div>
          <div className="public-tile">Add only the product context needed to start.</div>
          <div className="public-tile">Choose a plan and trial without forced card collection.</div>
          <div className="public-tile">Launch into the dashboard and run the actions you choose.</div>
        </div>
      </section>
    </PublicLayout>
  );
}
