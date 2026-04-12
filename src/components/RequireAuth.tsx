import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function RequireAuth({
  requireSuperAdmin = false,
  requireOrg = false,
}: {
  requireSuperAdmin?: boolean
  requireOrg?: boolean
}) {
  const { user, currentOrg, isSuperAdmin, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (requireSuperAdmin && !isSuperAdmin) return <Navigate to="/planner" replace />
  if (requireOrg && !currentOrg) return <Navigate to="/onboarding" replace />

  return <Outlet />
}
