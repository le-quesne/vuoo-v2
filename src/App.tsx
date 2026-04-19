import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'
import { AuthProvider } from '@/application/contexts/AuthContext'
import { RequireAuth } from '@/presentation/components/RequireAuth'
import { Layout } from '@/presentation/components/Layout'
import { PlannerLayout } from '@/presentation/components/PlannerLayout'
import { LoginPage } from '@/presentation/pages/LoginPage'
import { OnboardingPage } from '@/presentation/pages/OnboardingPage'
import { PlannerPage } from '@/presentation/pages/PlannerPage'
import { DayDashboardPage } from '@/presentation/pages/DayDashboardPage'
import { WeekDashboardPage } from '@/presentation/pages/WeekDashboardPage'
import { ControlPage } from '@/presentation/pages/ControlPage'
import { PlanDetailPage } from '@/presentation/pages/PlanDetailPage'
import { OrdersPage } from '@/presentation/pages/OrdersPage'
import { StopsPage } from '@/presentation/pages/StopsPage'
import { VehiclesPage } from '@/presentation/pages/VehiclesPage'
import { DriversPage } from '@/presentation/pages/DriversPage'
import { UsersPage } from '@/presentation/pages/UsersPage'
import { AnalyticsPage } from '@/presentation/pages/AnalyticsPage'
import { NotificationSettingsPage } from '@/presentation/pages/NotificationSettingsPage'
import { OrganizationSettingsPage } from '@/presentation/pages/OrganizationSettingsPage'
import { SettingsLayout } from '@/presentation/pages/settings/SettingsLayout'
import { AdminLayout } from '@/presentation/pages/admin/AdminLayout'
import { AdminDashboard } from '@/presentation/pages/admin/AdminDashboard'
import { AdminOrgDetail } from '@/presentation/pages/admin/AdminOrgDetail'
import { AdminUsers } from '@/presentation/pages/admin/AdminUsers'
import TrackingPage from '@/presentation/pages/TrackingPage'
import { DriverWelcomePage } from '@/presentation/pages/DriverWelcomePage'
import { WelcomePage } from '@/presentation/pages/WelcomePage'

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
