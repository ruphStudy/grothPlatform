import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import CampaignDetailPage from './pages/CampaignDetailPage';
import CampaignsPage from './pages/CampaignsPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import OrganizationPage from './pages/OrganizationPage';
import ProductPage from './pages/ProductPage';
import RegisterPage from './pages/RegisterPage';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
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
          path="/organizations/:organizationId/products/:productId/campaigns/:campaignId"
          element={
            <ProtectedRoute>
              <CampaignDetailPage />
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
