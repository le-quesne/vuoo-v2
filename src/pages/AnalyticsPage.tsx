import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const NAV_ITEMS = [
  'Resumen',
  'Planner',
  'Planes',
  'Todas las paradas',
  'Paradas completadas',
  'Paradas incompletas',
  'Paradas canceladas',
  'Horarios de entrega',
  'Prueba de entrega',
  'Motivos de cancelacion',
  'Drivers',
  'Tiempo promedio en ruta',
  'Seguimiento de la ruta',
  'Intentos de entrega',
  'Satisfaccion de los conductores',
  'Customers',
  'Satisfaccion',
  'Emails',
  'SMS',
]

export function AnalyticsPage() {
  const [activeNav, setActiveNav] = useState(0)
  const [stats, setStats] = useState({
    totalPlans: 0,
    totalStops: 0,
    completedStops: 0,
    cancelledStops: 0,
    incompleteStops: 0,
    pendingStops: 0,
    totalVehicles: 0,
    totalRoutes: 0,
  })
  const [stopsByStatus, setStopsByStatus] = useState<{ status: string; count: number }[]>([])

  useEffect(() => {
    loadStats()
  }, [])

  async function loadStats() {
    const [plans, stops, vehicles, routes] = await Promise.all([
      supabase.from('plans').select('id', { count: 'exact', head: true }),
      supabase.from('stops').select('id, status'),
      supabase.from('vehicles').select('id', { count: 'exact', head: true }),
      supabase.from('routes').select('id', { count: 'exact', head: true }),
    ])

    const allStops = stops.data ?? []
    const completed = allStops.filter((s) => s.status === 'completed').length
    const cancelled = allStops.filter((s) => s.status === 'cancelled').length
    const incomplete = allStops.filter((s) => s.status === 'incomplete').length
    const pending = allStops.filter((s) => s.status === 'pending').length

    setStats({
      totalPlans: plans.count ?? 0,
      totalStops: allStops.length,
      completedStops: completed,
      cancelledStops: cancelled,
      incompleteStops: incomplete,
      pendingStops: pending,
      totalVehicles: vehicles.count ?? 0,
      totalRoutes: routes.count ?? 0,
    })

    setStopsByStatus([
      { status: 'Pendientes', count: pending },
      { status: 'Completadas', count: completed },
      { status: 'Canceladas', count: cancelled },
      { status: 'Incompletas', count: incomplete },
    ])
  }

  const summaryCards = [
    { label: 'Planes', value: stats.totalPlans, color: 'bg-indigo-500' },
    { label: 'Todas las paradas', value: stats.totalStops, color: 'bg-blue-500' },
    { label: 'Paradas completadas', value: stats.completedStops, color: 'bg-green-500' },
    { label: 'Paradas canceladas', value: stats.cancelledStops, color: 'bg-red-500' },
    { label: 'Vehiculos', value: stats.totalVehicles, color: 'bg-orange-500' },
    { label: 'Rutas', value: stats.totalRoutes, color: 'bg-purple-500' },
  ]

  function renderContent() {
    const sectionName = NAV_ITEMS[activeNav]

    if (activeNav === 0) {
      return (
        <>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Resumen</h2>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-8">
            {summaryCards.map((card) => (
              <div key={card.label} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">{card.label}</span>
                  <div className={`w-2 h-2 rounded-full ${card.color}`} />
                </div>
                <div className="text-3xl font-bold mt-2">{card.value}</div>
              </div>
            ))}
          </div>

          {/* Stops breakdown bar */}
          {stats.totalStops > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Distribucion de paradas</h3>
              <div className="flex rounded-full overflow-hidden h-4 bg-gray-100">
                {stopsByStatus.map((s) => {
                  const pct = (s.count / stats.totalStops) * 100
                  if (pct === 0) return null
                  const colors: Record<string, string> = {
                    Pendientes: 'bg-yellow-400',
                    Completadas: 'bg-green-500',
                    Canceladas: 'bg-red-500',
                    Incompletas: 'bg-orange-400',
                  }
                  return (
                    <div
                      key={s.status}
                      className={`${colors[s.status] ?? 'bg-gray-300'} transition-all`}
                      style={{ width: `${pct}%` }}
                      title={`${s.status}: ${s.count} (${pct.toFixed(0)}%)`}
                    />
                  )
                })}
              </div>
              <div className="flex gap-4 mt-2 text-xs text-gray-500">
                {stopsByStatus.map((s) => (
                  <span key={s.status}>{s.status}: {s.count}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )
    }

    // For sections that show filtered stops data
    const stopSections: Record<number, string> = {
      3: 'all', 4: 'completed', 5: 'incomplete', 6: 'cancelled',
    }
    if (stopSections[activeNav] !== undefined) {
      const filter = stopSections[activeNav]
      const value = filter === 'all' ? stats.totalStops
        : filter === 'completed' ? stats.completedStops
        : filter === 'incomplete' ? stats.incompleteStops
        : stats.cancelledStops
      return (
        <div>
          <h2 className="text-xl font-semibold mb-6">{sectionName}</h2>
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <div className="text-5xl font-bold text-gray-900">{value}</div>
            <div className="text-sm text-gray-500 mt-2">{sectionName.toLowerCase()}</div>
          </div>
        </div>
      )
    }

    if (activeNav === 2) {
      return (
        <div>
          <h2 className="text-xl font-semibold mb-6">Planes</h2>
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <div className="text-5xl font-bold text-gray-900">{stats.totalPlans}</div>
            <div className="text-sm text-gray-500 mt-2">planes totales</div>
          </div>
        </div>
      )
    }

    if (activeNav === 10) {
      return (
        <div>
          <h2 className="text-xl font-semibold mb-6">Drivers</h2>
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <div className="text-5xl font-bold text-gray-900">{stats.totalVehicles}</div>
            <div className="text-sm text-gray-500 mt-2">vehiculos registrados</div>
          </div>
        </div>
      )
    }

    return (
      <div>
        <h2 className="text-xl font-semibold mb-6">{sectionName}</h2>
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">
          <p className="text-sm">Proximamente</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen">
      <div className="w-56 border-r border-gray-200 bg-white p-4 overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Analiticas</h2>
        <nav className="space-y-0.5">
          {NAV_ITEMS.map((item, i) => (
            <button
              key={item}
              onClick={() => setActiveNav(i)}
              className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                activeNav === i
                  ? 'bg-indigo-50 text-indigo-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {item}
            </button>
          ))}
        </nav>
      </div>
      <div className="flex-1 p-6 overflow-y-auto">
        {renderContent()}
      </div>
    </div>
  )
}
