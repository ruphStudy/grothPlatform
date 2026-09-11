import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import AnalyticsPage from './pages/AnalyticsPage';
import CampaignDetailPage from './pages/CampaignDetailPage';
import CampaignsPage from './pages/CampaignsPage';
import CmsConnectionsPage from './pages/CmsConnectionsPage';
import CrmPage from './pages/CrmPage';
import CreativeReviewPage from './pages/CreativeReviewPage';
import DashboardPage from './pages/DashboardPage';
import EmailSettingsPage from './pages/EmailSettingsPage';
import LeadDashboardPage from './pages/LeadDashboardPage';
import LeadsPage from './pages/LeadsPage';
import LoginPage from './pages/LoginPage';
import OrganizationPage from './pages/OrganizationPage';
import ProductPage from './pages/ProductPage';
import PublicLeadFormPage from './pages/PublicLeadFormPage';
import PublishingCalendarPage from './pages/PublishingCalendarPage';
import RegisterPage from './pages/RegisterPage';
import SocialConnectionsCallbackPage from './pages/SocialConnectionsCallbackPage';
import SocialConnectionsPage from './pages/SocialConnectionsPage';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forms/:publicKey" element={<PublicLeadFormPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organizations/:organizationId"
          element={
            <ProtectedRoute>
              <OrganizationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organizations/:organizationId/products/:productId"
          element={
            <ProtectedRoute>
              <ProductPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organizations/:organizationId/products/:productId/campaigns"
          element={
            <ProtectedRoute>
              <CampaignsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organizations/:organizationId/products/:productId/social-connections"
          element={
            <ProtectedRoute>
              <SocialConnectionsPage />
            </ProtectedRoute>
          }
        />
        <Route path="/social-connections/callback" element={<SocialConnectionsCallbackPage />} />
        <Route
          path="/organizations/:organizationId/products/:productId/cms-connections"
          element={
            <ProtectedRoute>
              <CmsConnectionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organizations/:organizationId/products/:productId/leads"
          element={
            <ProtectedRoute>
              <LeadsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organizations/:organizationId/products/:productId/leads/dashboard"
          element={
            <ProtectedRoute>
              <LeadDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organizations/:organizationId/products/:productId/crm"
          element={
            <ProtectedRoute>
              <CrmPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organizations/:organizationId/products/:productId/email"
          element={
            <ProtectedRoute>
              <EmailSettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organizations/:organizationId/products/:productId/analytics"
          element={
            <ProtectedRoute>
              <AnalyticsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organizations/:organizationId/products/:productId/campaigns/:campaignId"
          element={
            <ProtectedRoute>
              <CampaignDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organizations/:organizationId/products/:productId/campaigns/:campaignId/creative"
          element={
            <ProtectedRoute>
              <CreativeReviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/organizations/:organizationId/products/:productId/campaigns/:campaignId/publishing"
          element={
            <ProtectedRoute>
              <PublishingCalendarPage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
