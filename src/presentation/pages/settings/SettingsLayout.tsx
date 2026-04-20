import { NavLink, Outlet } from 'react-router-dom'
import { Settings as SettingsIcon } from 'lucide-react'

const tabs = [
  { to: '/settings', label: 'General', end: true },
  { to: '/settings/users', label: 'Usuarios' },
  { to: '/settings/notifications', label: 'Notificaciones' },
  { to: '/settings/customers', label: 'Clientes' },
  { to: '/settings/places', label: 'Lugares' },
  { to: '/settings/duplicates', label: 'Duplicados' },
  { to: '/settings/vehicles', label: 'Vehiculos' },
  { to: '/settings/drivers', label: 'Conductores' },
  { to: '/settings/api-tokens', label: 'API & Integraciones' },
]

export function SettingsLayout() {
  return (
    <div className="flex flex-col h-screen">
      <div className="px-6 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3 mb-3">
          <SettingsIcon size={20} className="text-gray-500" />
          <h1 className="text-lg font-semibold">Configuracion</h1>
        </div>
        <nav className="flex items-center gap-1 flex-wrap">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-600 font-medium'
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  )
}
