import { Link, useSearchParams } from 'react-router-dom';
import { AppLayout } from '../components/AppLayout';
import { Card } from '../components/Card';
import { PageHeader } from '../components/PageHeader';

function labelize(value: string): string {
  return value
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Landing target for the backend's OAuth callback redirect (18B item 34).
// Deliberately carries no token/code/state — only a coarse status.
export default function SocialConnectionsCallbackPage() {
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status');
  const platform = searchParams.get('platform');

  return (
    <AppLayout>
      <PageHeader title="Social Connection" />
      <Card>
        {status === 'success' ? (
          <p>{platform ? labelize(platform) : 'The social account'} was connected successfully. Return to the product's Social Connections page to see it.</p>
        ) : (
          <p>We couldn't complete the {platform ? labelize(platform) : 'social'} connection. Please try again from the product's Social Connections page.</p>
        )}
        <Link to="/dashboard" className="btn btn-secondary" style={{ marginTop: 12, display: 'inline-block' }}>
          Back to Dashboard
        </Link>
      </Card>
    </AppLayout>
  );
}
