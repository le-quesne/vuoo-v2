import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Filter } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Route, RouteStatus } from '../types/database'

type RouteRow = Route & { vehicle_name: string }

export function RoutesPage() {
  const [routes, setRoutes] = useState<RouteRow[]>([])
  const [statusFilter, setStatusFilter] = useState<RouteStatus | 'all'>('all')

  useEffect(() => {
    loadRoutes()
  }, [statusFilter])

  async function loadRoutes() {
    let query = supabase
      .from('routes')
      .select('*, vehicle:vehicles(name)')
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    const { data } = await query
    if (data) {
      setRoutes(
        data.map((r: any) => ({
          ...r,
          vehicle_name: r.vehicle?.name ?? '-',
        }))
      )
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Rutas</h1>
          <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-medium">
            Beta
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative">
          <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as RouteStatus | 'all')}
            className="pl-10 pr-8 py-2 border border-gray-200 rounded-lg text-sm appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="all">Todos los estados</option>
            <option value="not_started">No empezada</option>
            <option value="in_transit">En transito</option>
            <option value="completed">Finalizada</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 bg-gray-50 border-b border-gray-200">
              <th className="p-3 font-medium">Nombre</th>
              <th className="p-3 font-medium">Estado</th>
              <th className="p-3 font-medium">Paradas totales</th>
              <th className="p-3 font-medium">Distancia</th>
              <th className="p-3 font-medium">Duracion</th>
              <th className="p-3 font-medium">Fecha creacion</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((route) => (
              <tr
                key={route.id}
                className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer"
              >
                <td className="p-3 font-medium">{route.vehicle_name}</td>
                <td className="p-3">
                  <RouteStatusBadge status={route.status} />
                </td>
                <td className="p-3 text-gray-500">-</td>
                <td className="p-3 text-gray-500">
                  {route.total_distance_km
                    ? `${route.total_distance_km.toFixed(1)}km`
                    : '-'}
                </td>
                <td className="p-3 text-gray-500">
                  {route.total_duration_minutes
                    ? `${Math.floor(route.total_duration_minutes / 60)}h ${route.total_duration_minutes % 60}m`
                    : '-'}
                </td>
                <td className="p-3 text-gray-500">
                  {format(new Date(route.created_at), 'dd/MM')}
                </td>
              </tr>
            ))}
            {routes.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-400">
                  No hay rutas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RouteStatusBadge({ status }: { status: RouteStatus }) {
  const styles: Record<RouteStatus, string> = {
    not_started: 'bg-gray-100 text-gray-600',
    in_transit: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
  }
  const labels: Record<RouteStatus, string> = {
    not_started: 'No empezada',
    in_transit: 'En transito',
    completed: 'Finalizada',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}
