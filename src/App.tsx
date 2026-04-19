import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'
import { AuthProvider } from '@/application/contexts/AuthContext'
import { RequireAuth } from './components/RequireAuth'
import { Layout } from './components/Layout'
import { PlannerLayout } from './components/PlannerLayout'
import { LoginPage } from './pages/LoginPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { PlannerPage } from './pages/PlannerPage'
import { DayDashboardPage } from './pages/DayDashboardPage'
import { WeekDashboardPage } from './pages/WeekDashboardPage'
import { ControlPage } from './pages/ControlPage'
import { PlanDetailPage } from './pages/PlanDetailPage'
import { OrdersPage } from './pages/OrdersPage'
import { StopsPage } from './pages/StopsPage'
import { VehiclesPage } from './pages/VehiclesPage'
import { DriversPage } from './pages/DriversPage'
import { UsersPage } from './pages/UsersPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { NotificationSettingsPage } from './pages/NotificationSettingsPage'
import { OrganizationSettingsPage } from './pages/OrganizationSettingsPage'
import { SettingsLayout } from './pages/settings/SettingsLayout'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminDashboard } from './pages/admin/AdminDashboard'
import { AdminOrgDetail } from './pages/admin/AdminOrgDetail'
import { AdminUsers } from './pages/admin/AdminUsers'
import TrackingPage from './pages/TrackingPage'
import { DriverWelcomePage } from './pages/DriverWelcomePage'
import { WelcomePage } from './pages/WelcomePage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/track/:token" element={<TrackingPage />} />
          <Route path="/driver-welcome" element={<DriverWelcomePage />} />
          <Route path="/welcome" element={<WelcomePage />} />

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
              <Route element={<PlannerLayout />}>
                <Route path="/planner" element={<DayDashboardPage />} />
                <Route path="/planner/week" element={<WeekDashboardPage />} />
                <Route path="/planner/calendar" element={<PlannerPage />} />
              </Route>
              <Route path="/planner/:planId" element={<PlanDetailPage />} />
              <Route path="/control" element={<ControlPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/settings" element={<SettingsLayout />}>
                <Route index element={<OrganizationSettingsPage />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="notifications" element={<NotificationSettingsPage />} />
                <Route path="places" element={<StopsPage />} />
                <Route path="vehicles" element={<VehiclesPage />} />
                <Route path="drivers" element={<DriversPage />} />
              </Route>
              {/* Backward-compat redirects */}
              <Route path="/stops" element={<Navigate to="/settings/places" replace />} />
              <Route path="/vehicles" element={<Navigate to="/settings/vehicles" replace />} />
              <Route path="/drivers" element={<Navigate to="/settings/drivers" replace />} />
              <Route path="/users" element={<Navigate to="/settings/users" replace />} />
              <Route path="/notifications/settings" element={<Navigate to="/settings/notifications" replace />} />
              <Route path="/routes" element={<Navigate to="/planner" replace />} />
              <Route path="*" element={<Navigate to="/planner" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
