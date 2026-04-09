import { NavLink } from 'react-router-dom'
import {
  Calendar,
  MapPin,
  Route,
  Truck,
  BarChart3,
  LogOut,
  Shield,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

const navItems = [
  { to: '/planner', icon: Calendar, label: 'Planner' },
  { to: '/stops', icon: MapPin, label: 'Paradas' },
  { to: '/routes', icon: Route, label: 'Rutas' },
  { to: '/vehicles', icon: Truck, label: 'Drivers' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
]

export function Sidebar() {
  const { currentOrg, isSuperAdmin, signOut } = useAuth()

  return (
    <aside className="fixed left-0 top-0 h-screen w-16 bg-gray-900 flex flex-col items-center py-4 z-50">
      <div className="w-9 h-9 bg-indigo-500 rounded-lg flex items-center justify-center text-white font-bold text-sm mb-1">
        VU
      </div>
      {currentOrg && (
        <span className="text-[9px] text-gray-500 mb-4 max-w-[56px] text-center truncate" title={currentOrg.name}>
          {currentOrg.name}
        </span>
      )}

      <nav className="flex-1 flex flex-col gap-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${
                isActive
                  ? 'bg-indigo-500/20 text-indigo-400'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`
            }
            title={label}
          >
            <Icon size={20} />
          </NavLink>
        ))}
      </nav>

      <div className="flex flex-col gap-1 items-center">
        {isSuperAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `w-11 h-11 flex items-center justify-center rounded-lg transition-colors ${
                isActive
                  ? 'bg-red-500/20 text-red-400'
                  : 'text-gray-400 hover:text-red-400 hover:bg-gray-800'
              }`
            }
            title="Admin Panel"
          >
            <Shield size={20} />
          </NavLink>
        )}
        <button
          onClick={signOut}
          className="w-11 h-11 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-400 hover:bg-gray-800 transition-colors"
          title="Cerrar sesion"
        >
          <LogOut size={20} />
        </button>
      </div>
    </aside>
  )
}
