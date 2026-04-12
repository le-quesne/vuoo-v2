import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { RequireAuth } from './components/RequireAuth'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { PlannerPage } from './pages/PlannerPage'
import { PlanDetailPage } from './pages/PlanDetailPage'
import { OrdersPage } from './pages/OrdersPage'
import { StopsPage } from './pages/StopsPage'
import { RoutesPage } from './pages/RoutesPage'
import { VehiclesPage } from './pages/VehiclesPage'
import { DriversPage } from './pages/DriversPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { NotificationSettingsPage } from './pages/NotificationSettingsPage'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminDashboard } from './pages/admin/AdminDashboard'
import { AdminOrgDetail } from './pages/admin/AdminOrgDetail'
import { AdminUsers } from './pages/admin/AdminUsers'
import TrackingPage from './pages/TrackingPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/track/:token" element={<TrackingPage />} />

          {/* Onboarding */}
          <Route element={<RequireAuth />}>
            <Route path="/onboarding" element={<OnboardingPage />} />
          </Route>

          {/* Super Admin */}
          <Route path="/admin" element={<RequireAuth requireSuperAdmin />}>
            <Route element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="orgs/:orgId" element={<AdminOrgDetail />} />
              <Route path="users" element={<AdminUsers />} />
            </Route>
          </Route>

          {/* Tenant App */}
          <Route element={<RequireAuth requireOrg />}>
            <Route element={<Layout />}>
              <Route path="/planner" element={<PlannerPage />} />
              <Route path="/planner/:planId" element={<PlanDetailPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/stops" element={<StopsPage />} />
              <Route path="/routes" element={<RoutesPage />} />
              <Route path="/vehicles" element={<VehiclesPage />} />
              <Route path="/drivers" element={<DriversPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/notifications/settings" element={<NotificationSettingsPage />} />
              <Route path="*" element={<Navigate to="/planner" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
