import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  Clock,
  Navigation,
  MapPin,
  ChevronDown,
  ChevronRight,
  Plus,
  ArrowLeft,
  Truck,
  X,
  Zap,
  Loader2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { RouteMap, ROUTE_COLORS } from '../components/RouteMap'
import { MAPBOX_TOKEN, fetchDirections, optimizeTrip, formatDistance, formatDuration } from '../lib/mapbox'
import type { Plan, Route, Stop, Vehicle } from '../types/database'

type Tab = 'overview' | 'vehicles' | 'stops'

export function PlanDetailPage() {
  const { planId } = useParams<{ planId: string }>()
  const navigate = useNavigate()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [routes, setRoutes] = useState<(Route & { vehicle: Vehicle | null; stops: Stop[] })[]>([])
  const [unassignedStops, setUnassignedStops] = useState<Stop[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set())
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)
  const [showAddStop, setShowAddStop] = useState(false)
  const [showAddVehicle, setShowAddVehicle] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [optResult, setOptResult] = useState<{
    originalDistance: number
    originalDuration: number
    optimizedDistance: number
    optimizedDuration: number
    savings: { distancePct: number; durationPct: number }
  } | null>(null)

  useEffect(() => {
    if (planId) loadPlanData()
  }, [planId])

  async function loadPlanData() {
    const [planRes, routesRes, stopsRes] = await Promise.all([
      supabase.from('plans').select('*').eq('id', planId!).single(),
      supabase.from('routes').select('*, vehicle:vehicles(*)').eq('plan_id', planId!),
      supabase.from('stops').select('*').eq('plan_id', planId!).order('order_index'),
    ])

    if (planRes.data) setPlan(planRes.data)

    const routeData = (routesRes.data ?? []) as (Route & { vehicle: Vehicle | null })[]
    const allStops = stopsRes.data ?? []

    const routesWithStops = routeData.map((r) => ({
      ...r,
      stops: allStops.filter((s) => s.route_id === r.id),
    }))
    setRoutes(routesWithStops)
    setUnassignedStops(allStops.filter((s) => !s.route_id))
  }

  function toggleRoute(routeId: string) {
    setExpandedRoutes((prev) => {
      const next = new Set(prev)
      next.has(routeId) ? next.delete(routeId) : next.add(routeId)
      return next
    })
  }

  const totalStops = routes.reduce((sum, r) => sum + r.stops.length, 0) + unassignedStops.length
  const totalDistance = routes.reduce((sum, r) => sum + (r.total_distance_km ?? 0), 0)
  const totalDuration = routes.reduce((sum, r) => sum + (r.total_duration_minutes ?? 0), 0)
  const hours = Math.floor(totalDuration / 60)
  const mins = totalDuration % 60

  if (!plan) return <div className="p-6 text-gray-400">Cargando...</div>

  return (
    <div className="flex h-screen">
      <div className="w-96 border-r border-gray-200 bg-white flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <button
            onClick={() => navigate('/planner')}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2"
          >
            <ArrowLeft size={14} />
            Volver
          </button>
          <div className="text-xs text-gray-400">
            {plan.date ? format(new Date(plan.date), 'dd/MM/yyyy') : ''}
          </div>
          <h2 className="text-lg font-semibold">{plan.name}</h2>

          {/* Tabs */}
          <div className="flex gap-1 mt-3 bg-gray-100 rounded-lg p-0.5">
            {(['overview', 'vehicles', 'stops'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === tab
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'overview' && 'General'}
                {tab === 'vehicles' && `Vehiculos ${routes.length}`}
                {tab === 'stops' && `Paradas ${totalStops}`}
              </button>
            ))}
          </div>

          {/* Stats */}
          <div className="flex gap-4 mt-3 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Clock size={14} />
              <span>{hours}h {mins}m</span>
            </div>
            <div className="flex items-center gap-1">
              <Navigation size={14} />
              <span>{totalDistance.toFixed(1)}km</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'overview' && (
            <div className="p-2 space-y-1">
              {routes.map((route, routeIdx) => {
                const color = ROUTE_COLORS[routeIdx % ROUTE_COLORS.length]
                const tw = route.vehicle?.time_window_start && route.vehicle?.time_window_end
                  ? `${route.vehicle.time_window_start.slice(0, 5)}-${route.vehicle.time_window_end.slice(0, 5)}`
                  : null
                return (
                  <div key={route.id} className="border border-gray-100 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleRoute(route.id)}
                      className="w-full p-3 flex items-center gap-2 hover:bg-gray-50"
                    >
                      <div
                        className="w-1 self-stretch rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <div className="flex-1 text-left">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">
                            {route.vehicle?.name ?? 'Sin vehiculo'}
                          </span>
                          {tw && (
                            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                              {tw}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-3 text-xs text-gray-400 mt-1">
                          <span className="flex items-center gap-1">
                            <MapPin size={10} />
                            {route.stops.length}
                          </span>
                          <span>{(route.total_distance_km ?? 0).toFixed(1)}km</span>
                          <span>
                            0/{route.vehicle?.capacity_weight_kg ?? 0}kg
                          </span>
                        </div>
                      </div>
                      {expandedRoutes.has(route.id) ? (
                        <ChevronDown size={16} className="text-gray-400" />
                      ) : (
                        <ChevronRight size={16} className="text-gray-400" />
                      )}
                    </button>
                    {expandedRoutes.has(route.id) && (
                      <div className="px-3 pb-3 space-y-1">
                        {route.stops.map((stop, i) => (
                          <div
                            key={stop.id}
                            onClick={() => setSelectedStopId(stop.id)}
                            className={`flex items-center gap-2 p-2 text-xs rounded cursor-pointer transition-colors ${
                              selectedStopId === stop.id ? 'bg-indigo-50 ring-1 ring-indigo-300' : 'bg-gray-50 hover:bg-gray-100'
                            }`}
                          >
                            <span
                              className="w-5 h-5 rounded-full flex items-center justify-center font-medium text-[10px] text-white shrink-0"
                              style={{ backgroundColor: color }}
                            >
                              {i + 1}
                            </span>
                            <div className="flex-1 truncate">
                              <div className="font-medium">{stop.name}</div>
                              <div className="text-gray-400 truncate">
                                {stop.address ?? ''}
                              </div>
                            </div>
                            <StatusBadge status={stop.status} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Unassigned */}
              {unassignedStops.length > 0 && (
                <div className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-500">No asignadas</span>
                    <span className="text-xs text-gray-400">
                      {unassignedStops.length} Paradas
                    </span>
                  </div>
                  <div className="space-y-1">
                    {unassignedStops.map((stop) => (
                      <div
                        key={stop.id}
                        onClick={() => setSelectedStopId(stop.id)}
                        className="flex items-center gap-2 p-2 text-xs bg-gray-50 rounded cursor-pointer hover:bg-gray-100"
                      >
                        <MapPin size={12} className="text-gray-400 shrink-0" />
                        <span className="font-medium truncate">{stop.name}</span>
                        <StatusBadge status={stop.status} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {routes.length === 0 && unassignedStops.length === 0 && (
                <div className="text-center py-8 text-gray-400 text-sm">
                  <Truck size={32} className="mx-auto mb-2 opacity-40" />
                  <p>Agrega vehiculos y paradas</p>
                </div>
              )}

              {/* Add vehicle button */}
              <button
                onClick={() => setShowAddVehicle(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg hover:border-indigo-400 hover:text-indigo-600"
              >
                <Truck size={12} />
                Agregar vehiculo al plan
              </button>
            </div>
          )}

          {activeTab === 'stops' && (
            <div className="p-2">
              <StopsTable
                stops={[
                  ...routes.flatMap((r) =>
                    r.stops.map((s) => ({ ...s, vehicleName: r.vehicle?.name ?? '-' }))
                  ),
                  ...unassignedStops.map((s) => ({ ...s, vehicleName: '-' })),
                ]}
              />
            </div>
          )}

          {activeTab === 'vehicles' && (
            <div className="p-2 space-y-2">
              {routes.map((r, i) => {
                const color = ROUTE_COLORS[i % ROUTE_COLORS.length]
                return (
                  <div key={r.id} className="p-3 border border-gray-100 rounded-lg flex items-start gap-3">
                    <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{r.vehicle?.name ?? 'Sin vehiculo'}</div>
                      <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                        <div>Paradas: {r.stops.length}</div>
                        <div>Distancia: {(r.total_distance_km ?? 0).toFixed(1)}km</div>
                        <div>Capacidad: {r.vehicle?.capacity_weight_kg ?? 0}kg</div>
                        <div className="flex items-center gap-1">Estado: <StatusBadge status={r.status} /></div>
                      </div>
                    </div>
                  </div>
                )
              })}
              {routes.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Sin vehiculos asignados</p>
              )}
              <button
                onClick={() => setShowAddVehicle(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg hover:border-indigo-400 hover:text-indigo-600"
              >
                <Plus size={12} />
                Agregar vehiculo
              </button>
            </div>
          )}
        </div>

        {/* Optimization result */}
        {optResult && (
          <div className="p-3 border-t border-gray-200 bg-green-50/70">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={14} className="text-green-600" />
              <span className="text-xs font-semibold text-green-800">Ruta Optimizada</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="bg-white rounded-lg p-2 border border-green-100">
                <div className="text-[10px] text-gray-500 uppercase">Distancia</div>
                <div className="text-sm font-bold">{formatDistance(optResult.optimizedDistance)}</div>
                {optResult.savings.distancePct > 0 && (
                  <div className="text-[11px] text-green-600 font-medium">
                    -{formatDistance(optResult.originalDistance - optResult.optimizedDistance)} ({optResult.savings.distancePct}%)
                  </div>
                )}
              </div>
              <div className="bg-white rounded-lg p-2 border border-green-100">
                <div className="text-[10px] text-gray-500 uppercase">Tiempo</div>
                <div className="text-sm font-bold">{formatDuration(optResult.optimizedDuration)}</div>
                {optResult.savings.durationPct > 0 && (
                  <div className="text-[11px] text-green-600 font-medium">
                    -{formatDuration(optResult.originalDuration - optResult.optimizedDuration)} ({optResult.savings.durationPct}%)
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Bottom actions */}
        <div className="p-3 border-t border-gray-200 space-y-2">
          {totalStops >= 2 && (
            <button
              onClick={async () => {
                const allStops = [...routes.flatMap((r) => r.stops), ...unassignedStops]
                const withCoords = allStops.filter((s) => s.lat && s.lng)
                if (withCoords.length < 2) return

                setOptimizing(true)
                try {
                  const coords: [number, number][] = withCoords.map((s) => [s.lng!, s.lat!])
                  const original = await fetchDirections(coords)

                  if (withCoords.length >= 3) {
                    // 3+ stops: use Optimization API for TSP
                    const optimized = await optimizeTrip(coords)
                    if (original && optimized) {
                      setOptResult({
                        originalDistance: original.distance,
                        originalDuration: original.duration,
                        optimizedDistance: optimized.distance,
                        optimizedDuration: optimized.duration,
                        savings: {
                          distancePct: original.distance > 0
                            ? Math.round(((original.distance - optimized.distance) / original.distance) * 100) : 0,
                          durationPct: original.duration > 0
                            ? Math.round(((original.duration - optimized.duration) / original.duration) * 100) : 0,
                        },
                      })
                    }
                  } else if (original) {
                    // 2 stops: just show route info (no optimization possible)
                    setOptResult({
                      originalDistance: original.distance,
                      originalDuration: original.duration,
                      optimizedDistance: original.distance,
                      optimizedDuration: original.duration,
                      savings: { distancePct: 0, durationPct: 0 },
                    })
                  }
                } finally {
                  setOptimizing(false)
                }
              }}
              disabled={optimizing}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {optimizing ? (
                <><Loader2 size={14} className="animate-spin" /> Optimizando...</>
              ) : (
                <><Zap size={14} /> Optimizar ruta</>
              )}
            </button>
          )}
          <button
            onClick={() => setShowAddStop(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50"
          >
            <Plus size={14} />
            Anadir parada
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1">
        <RouteMap
          routeGroups={[
            ...routes.map((r, i) => ({
              routeId: r.id,
              vehicleName: r.vehicle?.name ?? 'Sin vehiculo',
              stops: r.stops,
              color: ROUTE_COLORS[i % ROUTE_COLORS.length],
            })),
            ...(unassignedStops.length > 0
              ? [{
                  routeId: 'unassigned',
                  vehicleName: 'No asignadas',
                  stops: unassignedStops,
                  color: '#9ca3af',
                }]
              : []),
          ]}
          onStopClick={(stop) => setSelectedStopId(stop.id)}
          selectedStopId={selectedStopId}
        />
      </div>

      {/* Add Stop Modal */}
      {showAddStop && (
        <AddStopToPlanModal
          planId={planId!}
          onClose={() => setShowAddStop(false)}
          onCreated={() => {
            setShowAddStop(false)
            loadPlanData()
          }}
        />
      )}

      {/* Add Vehicle Modal */}
      {showAddVehicle && (
        <AddVehicleToPlanModal
          planId={planId!}
          existingVehicleIds={routes.map((r) => r.vehicle_id).filter(Boolean) as string[]}
          onClose={() => setShowAddVehicle(false)}
          onAdded={() => {
            setShowAddVehicle(false)
            loadPlanData()
          }}
        />
      )}
    </div>
  )
}

function AddStopToPlanModal({
  planId,
  onClose,
  onCreated,
}: {
  planId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState({
    name: '',
    address: '',
    duration_minutes: 15,
    weight_kg: '',
    time_window_start: '',
    time_window_end: '',
  })
  const [loading, setLoading] = useState(false)

  async function geocode(address: string) {
    if (!address) return null
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&country=cl&limit=1`
      )
      const data = await res.json()
      if (data.features?.[0]) {
        const [lng, lat] = data.features[0].center
        return { lat, lng }
      }
    } catch {}
    return null
  }

  const { user, currentOrg } = useAuth()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !currentOrg) return
    setLoading(true)

    const coords = await geocode(form.address)

    await supabase.from('stops').insert({
      name: form.name,
      address: form.address || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      duration_minutes: form.duration_minutes,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
      time_window_start: form.time_window_start || null,
      time_window_end: form.time_window_end || null,
      plan_id: planId,
      status: 'pending',
      delivery_attempts: 0,
      user_id: user.id,
      org_id: currentOrg.id,
    })
    setLoading(false)
    onCreated()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Nueva parada</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Nombre *</label>
            <input
              required value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Direccion</label>
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Av. Apoquindo 7709, Las Condes"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Duracion (min)</label>
              <input type="number" value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Peso (kg)</label>
              <input type="number" value={form.weight_kg}
                onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Hora inicio</label>
              <input type="time" value={form.time_window_start}
                onChange={(e) => setForm({ ...form, time_window_start: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Hora fin</label>
              <input type="time" value={form.time_window_end}
                onChange={(e) => setForm({ ...form, time_window_end: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-6">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={loading}
            className="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600 disabled:opacity-50">
            {loading ? 'Creando...' : 'Crear'}
          </button>
        </div>
      </form>
    </div>
  )
}

function AddVehicleToPlanModal({
  planId,
  existingVehicleIds,
  onClose,
  onAdded,
}: {
  planId: string
  existingVehicleIds: string[]
  onClose: () => void
  onAdded: () => void
}) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('vehicles')
      .select('*')
      .order('name')
      .then(({ data }) => {
        if (data) setVehicles(data.filter((v) => !existingVehicleIds.includes(v.id)))
        setLoading(false)
      })
  }, [])

  const { user, currentOrg } = useAuth()

  async function addVehicle(vehicleId: string) {
    if (!user || !currentOrg) return
    await supabase.from('routes').insert({
      plan_id: planId,
      vehicle_id: vehicleId,
      status: 'not_started',
      user_id: user.id,
      org_id: currentOrg.id,
    })
    onAdded()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Agregar vehiculo</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-4">Cargando...</p>
        ) : vehicles.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">
            No hay vehiculos disponibles. Crea uno en la seccion Drivers.
          </p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {vehicles.map((v) => (
              <button
                key={v.id}
                onClick={() => addVehicle(v.id)}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 text-left transition-colors"
              >
                <Truck size={16} className="text-indigo-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{v.name}</div>
                  <div className="text-xs text-gray-400">
                    {v.capacity_weight_kg}kg
                    {v.license_plate ? ` - ${v.license_plate}` : ''}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        <button onClick={onClose}
          className="w-full mt-4 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
          Cerrar
        </button>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
    incomplete: 'bg-orange-100 text-orange-700',
    not_started: 'bg-gray-100 text-gray-600',
    in_transit: 'bg-blue-100 text-blue-700',
  }
  const labels: Record<string, string> = {
    pending: 'Pendiente',
    completed: 'Completada',
    cancelled: 'Cancelada',
    incomplete: 'Incompleta',
    not_started: 'No empezada',
    in_transit: 'En transito',
  }
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${styles[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {labels[status] ?? status}
    </span>
  )
}

function StopsTable({
  stops,
}: {
  stops: (Stop & { vehicleName: string })[]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-400 border-b border-gray-100">
            <th className="p-2 font-medium">Nombre</th>
            <th className="p-2 font-medium">Conductor</th>
            <th className="p-2 font-medium">Estado</th>
            <th className="p-2 font-medium">Horarios</th>
            <th className="p-2 font-medium">Dur.</th>
          </tr>
        </thead>
        <tbody>
          {stops.map((stop) => (
            <tr key={stop.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="p-2 font-medium max-w-[120px] truncate">{stop.name}</td>
              <td className="p-2 text-gray-500">{stop.vehicleName}</td>
              <td className="p-2"><StatusBadge status={stop.status} /></td>
              <td className="p-2 text-gray-500">
                {stop.time_window_start && stop.time_window_end
                  ? `${stop.time_window_start}-${stop.time_window_end}` : '-'}
              </td>
              <td className="p-2 text-gray-500">{stop.duration_minutes} min</td>
            </tr>
          ))}
          {stops.length === 0 && (
            <tr><td colSpan={5} className="p-4 text-center text-gray-400">Sin paradas</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
