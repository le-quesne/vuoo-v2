import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Users, ArrowLeft } from 'lucide-react'

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/users', icon: Users, label: 'Usuarios', end: false },
]

export function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="fixed left-0 top-0 h-screen w-56 bg-navy-950 flex flex-col p-4 z-50">
        <div className="flex items-center gap-2 mb-6">
          <img src="/logo_vuoo_white.svg" alt="Vuoo" className="w-9 h-9" />
          <div>
            <div className="text-white text-sm font-semibold">Vuoo Admin</div>
            <div className="text-slate-500 text-[10px]">Super Admin Panel</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-red-500/20 text-red-400'
                    : 'text-slate-400 hover:text-white hover:bg-navy-800'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <NavLink
          to="/planner"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-navy-800 transition-colors"
        >
          <ArrowLeft size={18} />
          Volver a la app
        </NavLink>
      </aside>
      <main className="flex-1 ml-56">
        <Outlet />
      </main>
    </div>
  )
}
