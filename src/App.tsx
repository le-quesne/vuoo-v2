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
import { StopsPage } from './pages/StopsPage'
import { RoutesPage } from './pages/RoutesPage'
import { VehiclesPage } from './pages/VehiclesPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { AdminLayout } from './pages/admin/AdminLayout'
import { AdminDashboard } from './pages/admin/AdminDashboard'
import { AdminOrgDetail } from './pages/admin/AdminOrgDetail'
import { AdminUsers } from './pages/admin/AdminUsers'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

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
              <Route path="/stops" element={<StopsPage />} />
              <Route path="/routes" element={<RoutesPage />} />
              <Route path="/vehicles" element={<VehiclesPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="*" element={<Navigate to="/planner" replace />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
