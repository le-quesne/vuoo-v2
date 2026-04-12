import { useState, useEffect, useMemo } from 'react'
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
  Search,
  Radio,
  Link2,
  Send,
  Check,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { RouteMap, ROUTE_COLORS } from '../components/RouteMap'
import { PODModal } from '../components/PODModal'
import { MAPBOX_TOKEN, fetchDirections, optimizeTrip, formatDistance, formatDuration } from '../lib/mapbox'
import type { Plan, Route, Stop, Vehicle, Driver, PlanStopWithStop, DriverLocation, NotificationLog, Order } from '../types/database'

type Tab = 'overview' | 'vehicles' | 'stops' | 'live'

const LIVE_THRESHOLD_MS = 60_000

export function PlanDetailPage() {
  const { planId } = useParams<{ planId: string }>()
  const navigate = useNavigate()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [routes, setRoutes] = useState<(Route & { vehicle: Vehicle | null; driver: Driver | null; planStops: PlanStopWithStop[] })[]>([])
  const [unassignedStops, setUnassignedStops] = useState<PlanStopWithStop[]>([])
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [expandedRoutes, setExpandedRoutes] = useState<Set<string>>(new Set())
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)
  const [showAddStop, setShowAddStop] = useState(false)
  const [showAddVehicle, setShowAddVehicle] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const [dragState, setDragState] = useState<{ routeId: string; fromIndex: number } | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [optResult, setOptResult] = useState<{
    originalDistance: number
    originalDuration: number
    optimizedDistance: number
    optimizedDuration: number
    savings: { distancePct: number; durationPct: number }
  } | null>(null)

  const [podPlanStop, setPodPlanStop] = useState<PlanStopWithStop | null>(null)
  const [notifLogs, setNotifLogs] = useState<NotificationLog[]>([])
  const [ordersByPlanStop, setOrdersByPlanStop] = useState<Map<string, Order>>(new Map())
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [driverLocations, setDriverLocations] = useState<Record<string, DriverLocation>>({})
  const [nowTick, setNowTick] = useState<number>(() => Date.now())

  useEffect(() => {
    if (planId) loadPlanData()
  }, [planId])

  async function loadPlanData() {
    const [planRes, routesRes, planStopsRes] = await Promise.all([
      supabase.from('plans').select('*').eq('id', planId!).single(),
      supabase.from('routes').select('*, vehicle:vehicles(*), driver:drivers(*)').eq('plan_id', planId!),
      supabase.from('plan_stops').select('*, stop:stops(*)').eq('plan_id', planId!).order('order_index'),
    ])

    if (planRes.data) setPlan(planRes.data)

    const routeData = (routesRes.data ?? []) as (Route & { vehicle: Vehicle | null; driver: Driver | null })[]
    const allPlanStops = (planStopsRes.data ?? []) as PlanStopWithStop[]

    // Fetch notification logs + orders for all plan stops
    const planStopIds = allPlanStops.map((ps) => ps.id)
    if (planStopIds.length > 0) {
      const [notifRes, ordersRes] = await Promise.all([
        supabase.from('notification_logs').select('*').in('plan_stop_id', planStopIds),
        supabase.from('orders').select('*').in('plan_stop_id', planStopIds),
      ])
      setNotifLogs(notifRes.data ?? [])
      const orderMap = new Map<string, Order>()
      for (const o of (ordersRes.data ?? []) as Order[]) {
        if (o.plan_stop_id) orderMap.set(o.plan_stop_id, o)
      }
      setOrdersByPlanStop(orderMap)
    } else {
      setNotifLogs([])
      setOrdersByPlanStop(new Map())
    }

    const routesWithStops = routeData.map((r) => ({
      ...r,
      planStops: allPlanStops.filter((ps) => ps.route_id === r.id),
    }))
    setRoutes(routesWithStops)
    setUnassignedStops(allPlanStops.filter((ps) => !ps.route_id))
  }

  // Live tab: ticker so "hace X seg" refreshes
  useEffect(() => {
    if (activeTab !== 'live') return
    const id = setInterval(() => setNowTick(Date.now()), 5000)
    return () => clearInterval(id)
  }, [activeTab])

  const routeIdsKey = useMemo(
    () => routes.map((r) => r.id).slice().sort().join(','),
    [routes]
  )

  // Live tab: load + subscribe to driver_locations for routes in this plan
  useEffect(() => {
    const routeIds = routeIdsKey ? routeIdsKey.split(',') : []
    if (routeIds.length === 0) {
      setDriverLocations({})
      return
    }

    let cancelled = false

    async function loadInitial() {
      try {
        const { data, error } = await supabase
          .from('driver_locations')
          .select('*')
          .in('route_id', routeIds)
          .order('recorded_at', { ascending: false })
          .limit(500)
        if (error || cancelled || !data) return
        const latestByRoute: Record<string, DriverLocation> = {}
        for (const row of data as DriverLocation[]) {
          const rid = row.route_id ?? row.driver_id ?? row.id
          if (!rid) continue
          if (!latestByRoute[rid]) latestByRoute[rid] = row
        }
        setDriverLocations((prev) => ({ ...prev, ...latestByRoute }))
      } catch {
        // Table may not exist yet — safely ignore.
      }
    }
    loadInitial()

    // Realtime subscription (server-side filter accepts `col=in.(a,b,c)`)
    const filter = `route_id=in.(${routeIds.join(',')})`
    const channel = supabase
      .channel(`driver-locations-plan-${planId}`)
      .on<DriverLocation>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_locations', filter },
        (payload) => {
          const row = payload.new as DriverLocation | undefined
          if (!row || !row.lat || !row.lng) return
          const rid = row.route_id ?? row.driver_id ?? row.id
          if (!rid) return
          setDriverLocations((prev) => {
            const existing = prev[rid]
            if (existing && existing.recorded_at && row.recorded_at && existing.recorded_at > row.recorded_at) {
              return prev
            }
            return { ...prev, [rid]: row }
          })
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [planId, routeIdsKey])

  function toggleRoute(routeId: string) {
    setExpandedRoutes((prev) => {
      const next = new Set(prev)
      next.has(routeId) ? next.delete(routeId) : next.add(routeId)
      return next
    })
  }

  async function handleReorder(routeId: string, fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return

    setRoutes((prev) =>
      prev.map((r) => {
        if (r.id !== routeId) return r
        const items = [...r.planStops]
        const [moved] = items.splice(fromIndex, 1)
        items.splice(toIndex, 0, moved)
        return { ...r, planStops: items }
      })
    )

    // Persist new order
    const route = routes.find((r) => r.id === routeId)
    if (!route) return
    const items = [...route.planStops]
    const [moved] = items.splice(fromIndex, 1)
    items.splice(toIndex, 0, moved)
    await Promise.all(
      items.map((ps, i) =>
        supabase.from('plan_stops').update({ order_index: i }).eq('id', ps.id)
      )
    )
  }

  const totalStops = routes.reduce((sum, r) => sum + r.planStops.length, 0) + unassignedStops.length
  const totalDistance = routes.reduce((sum, r) => sum + (r.total_distance_km ?? 0), 0)
  const totalDuration = routes.reduce((sum, r) => sum + (r.total_duration_minutes ?? 0), 0)
  const hours = Math.floor(totalDuration / 60)
  const mins = totalDuration % 60

  const mapRouteGroups = useMemo(() => {
    const toStops = (planStops: PlanStopWithStop[]): Stop[] =>
      planStops.map((ps) => ps.stop).filter(Boolean)
    return [
      ...routes.map((r, i) => ({
        routeId: r.id,
        vehicleName: r.vehicle?.name ?? 'Sin vehiculo',
        stops: toStops(r.planStops),
        color: ROUTE_COLORS[i % ROUTE_COLORS.length],
      })),
      ...(unassignedStops.length > 0
        ? [{
            routeId: 'unassigned',
            vehicleName: 'No asignadas',
            stops: toStops(unassignedStops),
            color: '#9ca3af',
          }]
        : []),
    ]
  }, [routes, unassignedStops])

  // Maps used by live tab
  const driverColorByRouteId = useMemo(() => {
    const map: Record<string, string> = {}
    routes.forEach((r, i) => {
      map[r.id] = ROUTE_COLORS[i % ROUTE_COLORS.length]
    })
    return map
  }, [routes])

  const driverNameByRouteId = useMemo(() => {
    const map: Record<string, string> = {}
    routes.forEach((r) => {
      map[r.id] = r.driver
        ? `${r.driver.first_name} ${r.driver.last_name}`
        : r.vehicle?.name ?? 'Conductor'
    })
    return map
  }, [routes])

  const liveDriverLocations = useMemo(() => Object.values(driverLocations), [driverLocations])

  const planStopById = useMemo(() => {
    const m = new Map<string, PlanStopWithStop>()
    for (const r of routes) for (const ps of r.planStops) m.set(ps.stop.id, ps)
    for (const ps of unassignedStops) m.set(ps.stop.id, ps)
    return m
  }, [routes, unassignedStops])

  function handleStopClick(stop: Stop) {
    setSelectedStopId(stop.id)
    const ps = planStopById.get(stop.id)
    if (ps && ps.status === 'completed') {
      setPodPlanStop(ps)
    }
  }

  const notifLogsByPlanStop = useMemo(() => {
    const map = new Map<string, NotificationLog[]>()
    for (const log of notifLogs) {
      const existing = map.get(log.plan_stop_id) ?? []
      existing.push(log)
      map.set(log.plan_stop_id, existing)
    }
    return map
  }, [notifLogs])

  function copyTrackingUrl(planStop: PlanStopWithStop) {
    const url = `${window.location.origin}/track/${planStop.tracking_token}`
    navigator.clipboard.writeText(url)
    setCopiedId(planStop.id)
    setTimeout(() => setCopiedId((prev) => (prev === planStop.id ? null : prev)), 2000)
  }

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
            {(['overview', 'vehicles', 'stops', 'live'] as Tab[]).map((tab) => {
              const hasLive = liveDriverLocations.some(
                (l) => l.recorded_at && nowTick - new Date(l.recorded_at).getTime() < LIVE_THRESHOLD_MS
              )
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    activeTab === tab
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab === 'overview' && 'General'}
                  {tab === 'vehicles' && `Veh. ${routes.length}`}
                  {tab === 'stops' && `Par. ${totalStops}`}
                  {tab === 'live' && (
                    <span className="inline-flex items-center gap-1 justify-center">
                      <Radio size={11} />
                      <span>Vivo</span>
                      {hasLive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      )}
                    </span>
                  )}
                </button>
              )
            })}
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
                        <div className="text-xs text-gray-400">
                          {route.driver
                            ? `Conductor: ${route.driver.first_name} ${route.driver.last_name}`
                            : 'Sin conductor'}
                        </div>
                        <div className="flex gap-3 text-xs text-gray-400 mt-1">
                          <span className="flex items-center gap-1">
                            <MapPin size={10} />
                            {route.planStops.length}
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
                        {route.planStops.map((ps, i) => (
                          <div
                            key={ps.id}
                            draggable
                            onDragStart={() => setDragState({ routeId: route.id, fromIndex: i })}
                            onDragOver={(e) => {
                              e.preventDefault()
                              setDragOverIndex(i)
                            }}
                            onDrop={() => {
                              if (dragState && dragState.routeId === route.id) {
                                handleReorder(route.id, dragState.fromIndex, i)
                              }
                              setDragState(null)
                              setDragOverIndex(null)
                            }}
                            onDragEnd={() => {
                              setDragState(null)
                              setDragOverIndex(null)
                            }}
                            onClick={() => handleStopClick(ps.stop)}
                            className={`flex items-center gap-2 p-2 text-xs rounded cursor-grab active:cursor-grabbing ${
                              selectedStopId === ps.stop.id ? 'bg-blue-50 ring-1 ring-blue-300' :
                              dragState?.routeId === route.id && dragOverIndex === i ? 'bg-blue-50 border-t-2 border-blue-400' :
                              'bg-gray-50 hover:bg-gray-100'
                            } ${dragState?.routeId === route.id && dragState.fromIndex === i ? 'opacity-40' : ''}`}
                          >
                            <span
                              className="w-5 h-5 rounded-full flex items-center justify-center font-medium text-[10px] text-white shrink-0"
                              style={{ backgroundColor: color }}
                            >
                              {i + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <div className="font-medium truncate">{ps.stop.name}</div>
                                {ordersByPlanStop.get(ps.id) && (
                                  <span className="font-mono text-[10px] text-blue-600 bg-blue-50 px-1 py-px rounded shrink-0">
                                    {ordersByPlanStop.get(ps.id)!.order_number}
                                  </span>
                                )}
                              </div>
                              <div className="text-gray-400 truncate">
                                {ps.stop.address ?? ''}
                              </div>
                              {ordersByPlanStop.get(ps.id) && (
                                <div className="text-[10px] text-gray-400 truncate">
                                  {(() => {
                                    const o = ordersByPlanStop.get(ps.id)!
                                    const itemCount = o.items?.length ?? 0
                                    const parts: string[] = []
                                    if (itemCount > 0) parts.push(`${itemCount} item${itemCount === 1 ? '' : 's'}`)
                                    if (o.total_weight_kg > 0) parts.push(`${o.total_weight_kg} kg`)
                                    return parts.join(' · ')
                                  })()}
                                </div>
                              )}
                              {/* Notification log indicators */}
                              {(notifLogsByPlanStop.get(ps.id)?.length ?? 0) > 0 && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  {notifLogsByPlanStop.get(ps.id)!.some((l) => l.channel === 'whatsapp') && (
                                    <span className="w-2 h-2 rounded-full bg-green-500" title="WhatsApp enviado" />
                                  )}
                                  {notifLogsByPlanStop.get(ps.id)!.some((l) => l.channel === 'email') && (
                                    <span className="w-2 h-2 rounded-full bg-blue-500" title="Email enviado" />
                                  )}
                                  {notifLogsByPlanStop.get(ps.id)!.some((l) => l.channel === 'sms') && (
                                    <span className="w-2 h-2 rounded-full bg-purple-500" title="SMS enviado" />
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {ps.tracking_token && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    copyTrackingUrl(ps)
                                  }}
                                  className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-blue-600 transition-colors"
                                  title="Copiar link de seguimiento"
                                >
                                  {copiedId === ps.id ? (
                                    <Check size={12} className="text-green-500" />
                                  ) : (
                                    <Link2 size={12} />
                                  )}
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  // Placeholder: invoke send-notification edge function
                                }}
                                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-blue-600 transition-colors"
                                title="Reenviar notificacion"
                              >
                                <Send size={12} />
                              </button>
                              <StatusBadge status={ps.status} />
                            </div>
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
                    {unassignedStops.map((ps) => (
                      <div
                        key={ps.id}
                        onClick={() => handleStopClick(ps.stop)}
                        className="flex items-center gap-2 p-2 text-xs bg-gray-50 rounded cursor-pointer hover:bg-gray-100"
                      >
                        <MapPin size={12} className="text-gray-400 shrink-0" />
                        <span className="font-medium truncate">{ps.stop.name}</span>
                        <StatusBadge status={ps.status} />
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
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:text-blue-600"
              >
                <Truck size={12} />
                Agregar vehiculo al plan
              </button>
            </div>
          )}

          {activeTab === 'stops' && (
            <div className="p-2">
              <StopsTable
                planStops={[
                  ...routes.flatMap((r) =>
                    r.planStops.map((ps) => ({
                      ...ps,
                      vehicleName: r.vehicle?.name ?? '-',
                      driverName: r.driver
                        ? `${r.driver.first_name} ${r.driver.last_name}`
                        : '-',
                    }))
                  ),
                  ...unassignedStops.map((ps) => ({ ...ps, vehicleName: '-', driverName: '-' })),
                ]}
                onRowClick={(ps) => {
                  setSelectedStopId(ps.stop.id)
                  if (ps.status === 'completed') setPodPlanStop(ps)
                }}
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
                        <div>Paradas: {r.planStops.length}</div>
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
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:text-blue-600"
              >
                <Plus size={12} />
                Agregar vehiculo
              </button>
            </div>
          )}

          {activeTab === 'live' && (
            <div className="p-2 space-y-2">
              {routes.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  Sin rutas asignadas.
                </p>
              ) : (
                routes.map((r, i) => {
                  const color = ROUTE_COLORS[i % ROUTE_COLORS.length]
                  const loc = driverLocations[r.id]
                  const isLive =
                    loc?.recorded_at != null &&
                    nowTick - new Date(loc.recorded_at).getTime() < LIVE_THRESHOLD_MS
                  const ageLabel = loc?.recorded_at ? formatAge(nowTick, loc.recorded_at) : null

                  return (
                    <div
                      key={r.id}
                      className="p-3 border border-gray-100 rounded-lg flex items-start gap-3"
                    >
                      <div
                        className="w-1 self-stretch rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-sm truncate">
                            {r.driver
                              ? `${r.driver.first_name} ${r.driver.last_name}`
                              : r.vehicle?.name ?? 'Sin conductor'}
                          </div>
                          {loc ? (
                            isLive ? (
                              <span className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded-full px-2 py-0.5 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                En vivo
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                                Offline
                              </span>
                            )
                          ) : (
                            <span className="text-[10px] font-medium text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">
                              Sin datos
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5 truncate">
                          {r.vehicle?.name ?? 'Sin vehiculo'}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {loc
                            ? `Ultima actualizacion ${ageLabel}`
                            : 'Aun sin ubicacion reportada.'}
                        </div>
                        {loc?.speed != null && (
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            {Math.round(loc.speed * 3.6)} km/h
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
              <p className="text-[11px] text-gray-400 text-center mt-3">
                Las posiciones se actualizan automaticamente cuando los conductores reportan su ubicacion.
              </p>
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
                const allPlanStops = [...routes.flatMap((r) => r.planStops), ...unassignedStops]
                const withCoords = allPlanStops.filter((ps) => ps.stop.lat && ps.stop.lng)
                if (withCoords.length < 2) return

                // Pick the first route to assign unassigned stops to
                const targetRoute = routes[0] ?? null

                setOptimizing(true)
                try {
                  const coords: [number, number][] = withCoords.map((ps) => [ps.stop.lng!, ps.stop.lat!])
                  const original = await fetchDirections(coords)

                  let finalDistance = original?.distance ?? 0
                  let finalDuration = original?.duration ?? 0
                  let optimizedOrder: number[] | null = null

                  if (withCoords.length >= 3) {
                    const optimized = await optimizeTrip(coords)
                    if (original && optimized) {
                      finalDistance = optimized.distance
                      finalDuration = optimized.duration
                      optimizedOrder = optimized.optimizedOrder
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
                    setOptResult({
                      originalDistance: original.distance,
                      originalDuration: original.duration,
                      optimizedDistance: original.distance,
                      optimizedDuration: original.duration,
                      savings: { distancePct: 0, durationPct: 0 },
                    })
                  }

                  // Persist: assign unassigned stops to target route + update order
                  if (targetRoute) {
                    // Assign unassigned plan_stops to this route
                    const unassignedIds = unassignedStops.map((ps) => ps.id)
                    if (unassignedIds.length > 0) {
                      await supabase
                        .from('plan_stops')
                        .update({ route_id: targetRoute.id, vehicle_id: targetRoute.vehicle_id })
                        .in('id', unassignedIds)
                    }

                    // Update order_index on all plan_stops
                    const ordered = optimizedOrder
                      ? optimizedOrder.map((idx) => withCoords[idx])
                      : withCoords
                    for (let i = 0; i < ordered.length; i++) {
                      await supabase
                        .from('plan_stops')
                        .update({ order_index: i })
                        .eq('id', ordered[i].id)
                    }

                    // Update route distance/duration
                    await supabase
                      .from('routes')
                      .update({
                        total_distance_km: Math.round((finalDistance / 1000) * 10) / 10,
                        total_duration_minutes: Math.round(finalDuration / 60),
                      })
                      .eq('id', targetRoute.id)
                  }

                  // Reload data
                  await loadPlanData()
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
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
          >
            <Plus size={14} />
            Anadir parada
          </button>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1">
        <RouteMap
          routeGroups={mapRouteGroups}
          onStopClick={handleStopClick}
          selectedStopId={selectedStopId}
          driverLocations={activeTab === 'live' ? liveDriverLocations : undefined}
          driverColorByRouteId={driverColorByRouteId}
          driverNameByRouteId={driverNameByRouteId}
        />
      </div>

      {/* Add Stop Modal */}
      {showAddStop && (
        <AddStopToPlanModal
          planId={planId!}
          existingStopIds={[
            ...routes.flatMap((r) => r.planStops.map((ps) => ps.stop_id)),
            ...unassignedStops.map((ps) => ps.stop_id),
          ]}
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

      {/* POD Modal */}
      {podPlanStop && (
        <PODModal planStop={podPlanStop} onClose={() => setPodPlanStop(null)} />
      )}
    </div>
  )
}

function formatAge(now: number, iso: string): string {
  const diff = now - new Date(iso).getTime()
  if (Number.isNaN(diff) || diff < 0) return 'justo ahora'
  const sec = Math.floor(diff / 1000)
  if (sec < 5) return 'justo ahora'
  if (sec < 60) return `hace ${sec} seg`
  const min = Math.floor(sec / 60)
  if (min < 60) return `hace ${min} min`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `hace ${hr} h`
  const d = Math.floor(hr / 24)
  return `hace ${d} d`
}

function AddStopToPlanModal({
  planId,
  existingStopIds,
  onClose,
  onCreated,
}: {
  planId: string
  existingStopIds: string[]
  onClose: () => void
  onCreated: () => void
}) {
  const [tab, setTab] = useState<'existing' | 'new'>('existing')
  const [existingStops, setExistingStops] = useState<Stop[]>([])
  const [loadingExisting, setLoadingExisting] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [assigning, setAssigning] = useState(false)

  const [form, setForm] = useState({
    name: '',
    address: '',
    duration_minutes: 15,
    weight_kg: '',
    time_window_start: '',
    time_window_end: '',
  })
  const [loading, setLoading] = useState(false)

  const { user, currentOrg } = useAuth()

  useEffect(() => {
    // Get unique stops by name+address (deduplicate recurrent stops)
    supabase
      .from('stops')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          const seen = new Map<string, Stop>()
          for (const s of data) {
            const key = `${s.name}|${s.address ?? ''}`
            if (!seen.has(key)) seen.set(key, s)
          }
          const excludeSet = new Set(existingStopIds)
          setExistingStops(Array.from(seen.values()).filter((s) => !excludeSet.has(s.id)))
        }
        setLoadingExisting(false)
      })
  }, [])

  const filtered = existingStops.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.address ?? '').toLowerCase().includes(search.toLowerCase())
  )

  function toggleStop(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleAssignExisting() {
    if (selectedIds.size === 0 || !currentOrg) return
    setAssigning(true)
    const rows = Array.from(selectedIds).map((stopId) => ({
      stop_id: stopId,
      plan_id: planId,
      status: 'pending' as const,
      delivery_attempts: 0,
      org_id: currentOrg.id,
    }))
    await supabase.from('plan_stops').insert(rows)
    setAssigning(false)
    onCreated()
  }

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

  async function handleCreateNew(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !currentOrg) return
    setLoading(true)

    const coords = await geocode(form.address)

    const { data: newStop } = await supabase.from('stops').insert({
      name: form.name,
      address: form.address || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      duration_minutes: form.duration_minutes,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
      time_window_start: form.time_window_start || null,
      time_window_end: form.time_window_end || null,
      user_id: user.id,
      org_id: currentOrg.id,
    }).select().single()

    if (newStop) {
      await supabase.from('plan_stops').insert({
        stop_id: newStop.id,
        plan_id: planId,
        status: 'pending',
        delivery_attempts: 0,
        org_id: currentOrg.id,
      })
    }

    setLoading(false)
    onCreated()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Anadir parada</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 mb-4">
          <button
            onClick={() => setTab('existing')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'existing' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Existentes {existingStops.length > 0 && `(${existingStops.length})`}
          </button>
          <button
            onClick={() => setTab('new')}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === 'new' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Crear nueva
          </button>
        </div>

        {tab === 'existing' ? (
          <>
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar parada..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0 max-h-64">
              {loadingExisting ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  {existingStops.length === 0 ? 'No hay paradas sin asignar' : 'Sin resultados'}
                </p>
              ) : (
                filtered.map((stop) => (
                  <button
                    key={stop.id}
                    type="button"
                    onClick={() => toggleStop(stop.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                      selectedIds.has(stop.id)
                        ? 'bg-blue-50 ring-1 ring-blue-300'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      selectedIds.has(stop.id)
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-gray-300'
                    }`}>
                      {selectedIds.has(stop.id) && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{stop.name}</div>
                      {stop.address && (
                        <div className="text-xs text-gray-400 truncate">{stop.address}</div>
                      )}
                    </div>
                    <MapPin size={14} className="text-gray-300 shrink-0" />
                  </button>
                ))
              )}
            </div>
            <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
              <button type="button" onClick={onClose}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAssignExisting}
                disabled={selectedIds.size === 0 || assigning}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
              >
                {assigning ? 'Asignando...' : `Anadir ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleCreateNew} className="flex-1 flex flex-col">
            <div className="space-y-3 flex-1">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Nombre *</label>
                <input
                  required value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Direccion</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Av. Apoquindo 7709, Las Condes"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Duracion (min)</label>
                  <input type="number" value={form.duration_minutes}
                    onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Peso (kg)</label>
                  <input type="number" value={form.weight_kg}
                    onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Hora inicio</label>
                  <input type="time" value={form.time_window_start}
                    onChange={(e) => setForm({ ...form, time_window_start: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Hora fin</label>
                  <input type="time" value={form.time_window_end}
                    onChange={(e) => setForm({ ...form, time_window_end: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50">
                {loading ? 'Creando...' : 'Crear'}
              </button>
            </div>
          </form>
        )}
      </div>
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
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('vehicles').select('*').order('name'),
      supabase.from('drivers').select('*').eq('status', 'active').order('first_name'),
    ]).then(([vehiclesRes, driversRes]) => {
      if (vehiclesRes.data) {
        setVehicles(vehiclesRes.data.filter((v) => !existingVehicleIds.includes(v.id)))
      }
      if (driversRes.data) setDrivers(driversRes.data)
      setLoading(false)
    })
  }, [])

  const { user, currentOrg } = useAuth()

  function selectVehicle(vehicleId: string) {
    setSelectedVehicleId(vehicleId)
    const suggested = drivers.find((d) => d.default_vehicle_id === vehicleId)
    setSelectedDriverId(suggested ? suggested.id : null)
  }

  async function addVehicle() {
    if (!user || !currentOrg || !selectedVehicleId) return
    setSaving(true)
    await supabase.from('routes').insert({
      plan_id: planId,
      vehicle_id: selectedVehicleId,
      driver_id: selectedDriverId,
      status: 'not_started',
      user_id: user.id,
      org_id: currentOrg.id,
    })
    setSaving(false)
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
          <>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {vehicles.map((v) => (
                <button
                  key={v.id}
                  onClick={() => selectVehicle(v.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-colors ${
                    selectedVehicleId === v.id
                      ? 'bg-blue-50 ring-1 ring-blue-300'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <Truck size={16} className="text-blue-400 shrink-0" />
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
            {selectedVehicleId && (
              <div className="mt-4">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Conductor (opcional)
                </label>
                <select
                  value={selectedDriverId ?? ''}
                  onChange={(e) => setSelectedDriverId(e.target.value || null)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">Sin conductor</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.first_name} {d.last_name}
                      {d.default_vehicle_id === selectedVehicleId ? ' (sugerido)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}
        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={addVehicle}
            disabled={!selectedVehicleId || saving}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? 'Agregando...' : 'Agregar'}
          </button>
        </div>
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
  planStops,
  onRowClick,
}: {
  planStops: (PlanStopWithStop & { vehicleName: string; driverName: string })[]
  onRowClick?: (ps: PlanStopWithStop) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-400 border-b border-gray-100">
            <th className="p-2 font-medium">Nombre</th>
            <th className="p-2 font-medium">Vehiculo</th>
            <th className="p-2 font-medium">Conductor</th>
            <th className="p-2 font-medium">Estado</th>
            <th className="p-2 font-medium">Horarios</th>
            <th className="p-2 font-medium">Dur.</th>
          </tr>
        </thead>
        <tbody>
          {planStops.map((ps) => (
            <tr
              key={ps.id}
              onClick={() => onRowClick?.(ps)}
              className={`border-b border-gray-50 hover:bg-gray-50 ${onRowClick ? 'cursor-pointer' : ''}`}
            >
              <td className="p-2 font-medium max-w-[120px] truncate">{ps.stop.name}</td>
              <td className="p-2 text-gray-500">{ps.vehicleName}</td>
              <td className="p-2 text-gray-500">{ps.driverName}</td>
              <td className="p-2"><StatusBadge status={ps.status} /></td>
              <td className="p-2 text-gray-500">
                {ps.stop.time_window_start && ps.stop.time_window_end
                  ? `${ps.stop.time_window_start}-${ps.stop.time_window_end}` : '-'}
              </td>
              <td className="p-2 text-gray-500">{ps.stop.duration_minutes} min</td>
            </tr>
          ))}
          {planStops.length === 0 && (
            <tr><td colSpan={6} className="p-4 text-center text-gray-400">Sin paradas</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
