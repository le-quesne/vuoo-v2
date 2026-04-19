import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Calendar,
  Package,
  BarChart3,
  Settings,
  LogOut,
  Shield,
  ChevronsLeft,
  ChevronsRight,
  Activity,
} from 'lucide-react'
import { supabase } from '@/application/lib/supabase'
import { useAuth } from '@/application/hooks/useAuth'

const navItems = [
  { to: '/planner', icon: Calendar, label: 'Planner' },
  { to: '/orders', icon: Package, label: 'Pedidos', badgeKey: 'pendingOrders' as const },
  { to: '/control', icon: Activity, label: 'Control', badgeKey: 'controlAlerts' as const },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
]

export function Sidebar({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const { currentOrg, isSuperAdmin, signOut } = useAuth()
  const [pendingOrders, setPendingOrders] = useState(0)
  const [controlAlerts, setControlAlerts] = useState(0)

  useEffect(() => {
    if (!currentOrg) return
    let cancelled = false

    async function load() {
      const { count } = await supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', currentOrg!.id)
        .eq('status', 'pending')
      if (!cancelled && count !== null) setPendingOrders(count)
    }
    load()

    const channel = supabase
      .channel(`orders-badge-${currentOrg.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `org_id=eq.${currentOrg.id}` },
        () => load(),
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [currentOrg])

  useEffect(() => {
    if (!currentOrg) return
    let cancelled = false

    async function load() {
      const today = new Date().toISOString().slice(0, 10)
      const { data } = await supabase.rpc('get_live_dashboard', {
        p_org_id: currentOrg!.id,
        p_date: today,
      })
      if (cancelled || !data) return
      const d = data as { drivers_online: number; drivers_total: number; stops_failed: number }
      const offlineCount = Math.max(d.drivers_total - d.drivers_online, 0)
      setControlAlerts(offlineCount + d.stops_failed)
    }
    load()
    const id = setInterval(load, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [currentOrg])

  const badges: Record<string, number> = {
    pendingOrders,
    controlAlerts,
  }

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-navy-950 flex flex-col py-4 z-50 transition-all duration-200 ${
        expanded ? 'w-48 items-stretch px-3' : 'w-16 items-center'
      }`}
    >
      <div className={`flex flex-col items-center mb-1 ${expanded ? 'py-2' : ''}`}>
        <img src="/logo_vuoo_white.svg" alt="Vuoo" className={`shrink-0 ${expanded ? 'h-20' : 'w-9 h-9'}`} />
      </div>
      {currentOrg && (
        <span
          className={`text-slate-400 mb-4 truncate text-center ${expanded ? 'text-sm font-medium' : 'text-[9px] max-w-[56px]'}`}
          title={currentOrg.name}
        >
          {currentOrg.name}
        </span>
      )}

      <nav className="flex-1 flex flex-col gap-1">
        {navItems.map(({ to, icon: Icon, label, badgeKey }) => {
          const badgeCount = badgeKey ? badges[badgeKey] : 0
          return (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `relative h-11 flex items-center rounded-lg transition-colors ${
                  expanded ? 'px-3 gap-3' : 'w-11 justify-center'
                } ${
                  isActive
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'text-slate-400 hover:text-white hover:bg-navy-800'
                }`
              }
              title={expanded ? undefined : label}
            >
              <div className="relative shrink-0">
                <Icon size={20} />
                {!expanded && badgeCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-amber-400 text-navy-950 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </div>
              {expanded && (
                <>
                  <span className="text-sm truncate">{label}</span>
                  {badgeCount > 0 && (
                    <span className="ml-auto bg-amber-400 text-navy-950 text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="flex flex-col gap-1">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `h-11 flex items-center rounded-lg transition-colors ${
              expanded ? 'px-3 gap-3' : 'w-11 justify-center'
            } ${
              isActive
                ? 'bg-blue-500/20 text-blue-400'
                : 'text-slate-400 hover:text-white hover:bg-navy-800'
            }`
          }
          title={expanded ? undefined : 'Configuracion'}
        >
          <Settings size={20} className="shrink-0" />
          {expanded && <span className="text-sm truncate">Configuracion</span>}
        </NavLink>
        {isSuperAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `h-11 flex items-center rounded-lg transition-colors ${
                expanded ? 'px-3 gap-3' : 'w-11 justify-center'
              } ${
                isActive
                  ? 'bg-red-500/20 text-red-400'
                  : 'text-slate-400 hover:text-red-400 hover:bg-navy-800'
              }`
            }
            title={expanded ? undefined : 'Admin Panel'}
          >
            <Shield size={20} className="shrink-0" />
            {expanded && <span className="text-sm truncate">Admin</span>}
          </NavLink>
        )}
        <button
          onClick={signOut}
          className={`h-11 flex items-center rounded-lg text-slate-400 hover:text-red-400 hover:bg-navy-800 transition-colors ${
            expanded ? 'px-3 gap-3' : 'w-11 justify-center'
          }`}
          title={expanded ? undefined : 'Cerrar sesion'}
        >
          <LogOut size={20} className="shrink-0" />
          {expanded && <span className="text-sm truncate">Salir</span>}
        </button>
        <button
          onClick={onToggle}
          className={`h-9 flex items-center rounded-lg text-slate-500 hover:text-white hover:bg-navy-800 transition-colors ${
            expanded ? 'px-3 gap-3' : 'w-11 justify-center'
          }`}
          title={expanded ? 'Colapsar' : 'Expandir'}
        >
          {expanded ? <ChevronsLeft size={18} /> : <ChevronsRight size={18} />}
          {expanded && <span className="text-xs truncate">Colapsar</span>}
        </button>
      </div>
    </aside>
  )
}
