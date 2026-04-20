import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  Clock,
  Navigation,
  MapPin,
  Plus,
  ArrowLeft,
  Truck,
  X,
  Trash2,
  Pencil,
  Settings,
  GripVertical,
  MoreHorizontal,
  Activity,
} from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { supabase } from '@/application/lib/supabase'
import { useAuth } from '@/application/hooks/useAuth'
import { RouteMap, ROUTE_COLORS } from '@/presentation/components/RouteMap'
import {
  PODModal,
  DepotConfigModal,
  EditRouteModal,
  ActivityTimeline,
  PlanDetailSkeleton,
  RouteDropZone,
  SortablePlanStop,
  AddStopToPlanModal,
  AddVehicleToPlanModal,
} from '@/presentation/features/plans/components'
import { VroomWizardModal } from '@/presentation/features/planner/components/VroomWizardModal'
import { ConfirmDialog } from '@/presentation/components/ConfirmDialog'
import { calculateRouteWeight, getCapacityStatus } from '@/presentation/features/plans/utils/capacity'
import { routePlannedKm, routeTraveledKm } from '@/presentation/features/plans/utils/routeMetrics'
import { fetchDirections } from '@/application/lib/mapbox'
import type { Plan, Route, Stop, Vehicle, Driver, PlanStopWithStop, NotificationLog, Order } from '@/data/types/database'

const UNASSIGNED_ID = 'unassigned'

export function PlanDetailPage() {
  const { planId } = useParams<{ planId: string }>()
  const navigate = useNavigate()
  const { currentOrg } = useAuth()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [routes, setRoutes] = useState<(Route & { vehicle: Vehicle | null; driver: Driver | null; planStops: PlanStopWithStop[] })[]>([])
  const [unassignedStops, setUnassignedStops] = useState<PlanStopWithStop[]>([])
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null)
  const [showAddStop, setShowAddStop] = useState(false)
  const [showAddVehicle, setShowAddVehicle] = useState(false)
  const [showVroomWizard, setShowVroomWizard] = useState(false)
  const [showDepotModal, setShowDepotModal] = useState(false)
  const [orgDepot, setOrgDepot] = useState<{ lat: number; lng: number; address: string | null } | null>(null)
  const [fetchedDistancesKm, setFetchedDistancesKm] = useState<Record<string, number>>({})
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [deletePlanStopId, setDeletePlanStopId] = useState<string | null>(null)
  const [deleteRouteId, setDeleteRouteId] = useState<string | null>(null)
  const [editRouteId, setEditRouteId] = useState<string | null>(null)
  const [menuRouteId, setMenuRouteId] = useState<string | null>(null)
  const [renamingRouteId, setRenamingRouteId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renamingPlan, setRenamingPlan] = useState(false)
  const [planNameDraft, setPlanNameDraft] = useState('')

  const [podPlanStop, setPodPlanStop] = useState<PlanStopWithStop | null>(null)
  const [notifLogs, setNotifLogs] = useState<NotificationLog[]>([])
  const [ordersByPlanStop, setOrdersByPlanStop] = useState<Map<string, Order>>(new Map())
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [showActivity, setShowActivity] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const planRouteIds = useMemo(() => routes.map((r) => r.id), [routes])
  const planDriverNames = useMemo(() => {
    const m: Record<string, string> = {}
    for (const r of routes) {
      if (r.driver) {
        m[r.driver.id] = `${r.driver.first_name} ${r.driver.last_name}`.trim()
      }
    }
    return m
  }, [routes])
  const planStopNames = useMemo(() => {
    const m: Record<string, string> = {}
    for (const r of routes) {
      for (const ps of r.planStops) m[ps.id] = ps.stop?.name ?? 'Parada'
    }
    for (const ps of unassignedStops) m[ps.id] = ps.stop?.name ?? 'Parada'
    return m
  }, [routes, unassignedStops])

  useEffect(() => {
    if (planId) loadPlanData()
  }, [planId])

  useEffect(() => {
    if (!currentOrg) return
    supabase
      .from('organizations')
      .select('default_depot_lat, default_depot_lng, default_depot_address')
      .eq('id', currentOrg.id)
      .single()
      .then(({ data }) => {
        if (data && data.default_depot_lat != null && data.default_depot_lng != null) {
          setOrgDepot({
            lat: data.default_depot_lat,
            lng: data.default_depot_lng,
            address: data.default_depot_address ?? null,
          })
        } else {
          setOrgDepot(null)
        }
      })
  }, [currentOrg])

  const routeDistanceKey = useMemo(() =>
    JSON.stringify(
      routes.map((r) => ({
        id: r.id,
        total: r.total_distance_km,
        stops: r.planStops
          .filter((ps) => ps.stop?.lat != null && ps.stop?.lng != null)
          .map((ps) => ({ lat: ps.stop.lat, lng: ps.stop.lng })),
      })),
    ) + `|${orgDepot?.lat ?? ''}|${orgDepot?.lng ?? ''}`,
    [routes, orgDepot?.lat, orgDepot?.lng],
  )

  useEffect(() => {
    let cancelled = false
    async function run() {
      const results: Record<string, number> = {}
      for (const r of routes) {
        if (r.total_distance_km && r.total_distance_km > 0) continue
        const stops = r.planStops
          .map((ps) => ps.stop)
          .filter((s): s is Stop & { lat: number; lng: number } =>
            !!s && s.lat != null && s.lng != null,
          )
        if (stops.length === 0) continue
        const coords: [number, number][] = []
        if (orgDepot) coords.push([orgDepot.lng, orgDepot.lat])
        for (const s of stops) coords.push([s.lng, s.lat])
        if (orgDepot) coords.push([orgDepot.lng, orgDepot.lat])
        if (coords.length < 2) continue
        try {
          const d = await fetchDirections(coords)
          if (cancelled) return
          if (d) results[r.id] = d.distance / 1000
        } catch {
          // ignore
        }
      }
      if (!cancelled) setFetchedDistancesKm(results)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [routeDistanceKey])

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

  function findContainer(planStopId: string): string | null {
    if (unassignedStops.some((ps) => ps.id === planStopId)) return UNASSIGNED_ID
    for (const r of routes) if (r.planStops.some((ps) => ps.id === planStopId)) return r.id
    return null
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id))
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveDragId(null)
    if (!over) return

    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return

    const fromContainer = findContainer(activeId)
    if (!fromContainer) return

    const toContainer = overId === UNASSIGNED_ID || routes.some((r) => r.id === overId)
      ? overId
      : findContainer(overId)
    if (!toContainer) return

    if (fromContainer === toContainer) {
      const list = fromContainer === UNASSIGNED_ID
        ? unassignedStops
        : (routes.find((r) => r.id === fromContainer)?.planStops ?? [])
      const oldIndex = list.findIndex((ps) => ps.id === activeId)
      const newIndex = list.findIndex((ps) => ps.id === overId)
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return
      const reordered = arrayMove(list, oldIndex, newIndex)
      if (fromContainer === UNASSIGNED_ID) {
        setUnassignedStops(reordered)
      } else {
        setRoutes((prev) => prev.map((r) => (r.id === fromContainer ? { ...r, planStops: reordered } : r)))
      }
      await Promise.all(
        reordered.map((ps, i) =>
          supabase.from('plan_stops').update({ order_index: i }).eq('id', ps.id),
        ),
      )
      return
    }

    const fromList = fromContainer === UNASSIGNED_ID
      ? unassignedStops
      : (routes.find((r) => r.id === fromContainer)?.planStops ?? [])
    const toList = toContainer === UNASSIGNED_ID
      ? unassignedStops
      : (routes.find((r) => r.id === toContainer)?.planStops ?? [])

    const movingStop = fromList.find((ps) => ps.id === activeId)
    if (!movingStop) return

    const overIndex = toList.findIndex((ps) => ps.id === overId)
    const destIndex = overIndex === -1 ? toList.length : overIndex

    const targetVehicleId = toContainer === UNASSIGNED_ID
      ? null
      : (routes.find((r) => r.id === toContainer)?.vehicle_id ?? null)

    const updatedStop: PlanStopWithStop = {
      ...movingStop,
      route_id: toContainer === UNASSIGNED_ID ? null : toContainer,
      vehicle_id: targetVehicleId,
    }

    const nextRoutes = routes.map((r) => ({ ...r, planStops: r.planStops.filter((ps) => ps.id !== activeId) }))
    const nextUnassigned = unassignedStops.filter((ps) => ps.id !== activeId)

    if (toContainer === UNASSIGNED_ID) {
      nextUnassigned.splice(destIndex, 0, updatedStop)
    } else {
      const idx = nextRoutes.findIndex((r) => r.id === toContainer)
      if (idx >= 0) {
        const newStops = [...nextRoutes[idx].planStops]
        newStops.splice(destIndex, 0, updatedStop)
        nextRoutes[idx] = { ...nextRoutes[idx], planStops: newStops }
      }
    }

    setRoutes(nextRoutes)
    setUnassignedStops(nextUnassigned)

    await supabase
      .from('plan_stops')
      .update({
        route_id: toContainer === UNASSIGNED_ID ? null : toContainer,
        vehicle_id: targetVehicleId,
      })
      .eq('id', activeId)

    const persistList = toContainer === UNASSIGNED_ID
      ? nextUnassigned
      : (nextRoutes.find((r) => r.id === toContainer)?.planStops ?? [])
    await Promise.all(
      persistList.map((ps, i) =>
        supabase.from('plan_stops').update({ order_index: i }).eq('id', ps.id),
      ),
    )

    if (fromContainer !== toContainer && fromContainer !== UNASSIGNED_ID) {
      const fromPersist = nextRoutes.find((r) => r.id === fromContainer)?.planStops ?? []
      await Promise.all(
        fromPersist.map((ps, i) =>
          supabase.from('plan_stops').update({ order_index: i }).eq('id', ps.id),
        ),
      )
    }
  }

  async function confirmDeletePlanStop() {
    if (!deletePlanStopId) return
    await supabase.from('plan_stops').delete().eq('id', deletePlanStopId)
    setDeletePlanStopId(null)
    await loadPlanData()
  }

  async function confirmDeleteRoute() {
    if (!deleteRouteId) return
    await supabase
      .from('plan_stops')
      .update({ route_id: null, vehicle_id: null, order_index: 0 })
      .eq('route_id', deleteRouteId)
    await supabase.from('routes').delete().eq('id', deleteRouteId)
    setDeleteRouteId(null)
    await loadPlanData()
  }

  function startRenameRoute(routeId: string, currentName: string) {
    setRenamingRouteId(routeId)
    setRenameDraft(currentName)
  }

  async function commitRenameRoute() {
    if (!renamingRouteId) return
    const trimmed = renameDraft.trim()
    const nextName = trimmed.length > 0 ? trimmed : null
    setRoutes((prev) => prev.map((r) => (r.id === renamingRouteId ? { ...r, name: nextName } : r)))
    const id = renamingRouteId
    setRenamingRouteId(null)
    setRenameDraft('')
    await supabase.from('routes').update({ name: nextName }).eq('id', id)
  }

  function cancelRenameRoute() {
    setRenamingRouteId(null)
    setRenameDraft('')
  }

  function startRenamePlan() {
    if (!plan) return
    setPlanNameDraft(plan.name)
    setRenamingPlan(true)
  }

  async function commitRenamePlan() {
    if (!plan) return
    const trimmed = planNameDraft.trim()
    setRenamingPlan(false)
    if (trimmed.length === 0 || trimmed === plan.name) {
      setPlanNameDraft('')
      return
    }
    setPlan({ ...plan, name: trimmed })
    setPlanNameDraft('')
    await supabase.from('plans').update({ name: trimmed }).eq('id', plan.id)
  }

  function cancelRenamePlan() {
    setRenamingPlan(false)
    setPlanNameDraft('')
  }

  const totalStops = routes.reduce((sum, r) => sum + r.planStops.length, 0) + unassignedStops.length
  const totalDistance = routes.reduce((sum, r) => sum + routePlannedKm(r, fetchedDistancesKm), 0)
  const traveledDistance = routes.reduce((sum, r) => sum + routeTraveledKm(r, fetchedDistancesKm), 0)
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

  if (!plan) return <PlanDetailSkeleton />


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
          {renamingPlan ? (
            <input
              autoFocus
              value={planNameDraft}
              onChange={(e) => setPlanNameDraft(e.target.value)}
              onBlur={commitRenamePlan}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void commitRenamePlan()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  cancelRenamePlan()
                }
              }}
              className="w-full text-lg font-semibold px-1.5 py-0.5 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          ) : (
            <div className="flex items-center gap-1 group">
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              <button
                onClick={startRenamePlan}
                className="p-1 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Renombrar plan"
              >
                <Pencil size={13} />
              </button>
            </div>
          )}

          {/* Stats + depot */}
          <div className="flex items-center justify-between mt-3 gap-2">
            <div className="flex gap-3 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <Clock size={14} />
                <span>{hours}h {mins}m</span>
              </div>
              <div className="flex items-center gap-1">
                <Navigation size={14} />
                <span>{Math.round(traveledDistance)}/{Math.round(totalDistance)}km</span>
              </div>
              <div className="flex items-center gap-1">
                <MapPin size={14} />
                <span>{totalStops}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setShowActivity((v) => !v)}
                className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition-colors ${
                  showActivity
                    ? 'border-gray-300 bg-gray-100 text-gray-900'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
                title="Ver timeline de actividad"
              >
                <Activity size={12} />
                Actividad
              </button>
              <button
                onClick={() => setShowDepotModal(true)}
                className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition-colors ${
                  orgDepot
                    ? 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                }`}
                title={orgDepot?.address ?? 'Configurar depot (requerido para optimizar)'}
              >
                <Settings size={12} />
                {orgDepot ? 'Depot' : 'Depot faltante'}
              </button>
            </div>
          </div>
        </div>

        {/* Content: DndContext unified view */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {routes.map((route, routeIdx) => {
              const color = ROUTE_COLORS[routeIdx % ROUTE_COLORS.length]
              const tw = route.vehicle?.time_window_start && route.vehicle?.time_window_end
                ? `${route.vehicle.time_window_start.slice(0, 5)}-${route.vehicle.time_window_end.slice(0, 5)}`
                : null
              const usedKg = calculateRouteWeight(route.planStops, ordersByPlanStop)
              const capacity = getCapacityStatus(usedKg, route.vehicle?.capacity_weight_kg ?? null)
              const capacityBarColor =
                capacity?.color === 'green' ? 'bg-emerald-500'
                : capacity?.color === 'yellow' ? 'bg-amber-500'
                : capacity?.color === 'red' ? 'bg-red-500'
                : 'bg-gray-300'

              return (
                <div key={route.id} className="border border-gray-100 rounded-lg overflow-hidden bg-white">
                  {/* Route header */}
                  <div className="p-3 flex items-start gap-2">
                    <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        {renamingRouteId === route.id ? (
                          <input
                            autoFocus
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onBlur={commitRenameRoute}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                void commitRenameRoute()
                              } else if (e.key === 'Escape') {
                                e.preventDefault()
                                cancelRenameRoute()
                              }
                            }}
                            placeholder={route.vehicle?.name ?? 'Nombre de la ruta'}
                            className="flex-1 min-w-0 text-sm font-medium px-1.5 py-0.5 border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        ) : (
                          <div className="flex items-center gap-1 min-w-0 group">
                            <span className="font-medium text-sm truncate">
                              {route.name ?? route.vehicle?.name ?? 'Sin vehiculo'}
                            </span>
                            <button
                              onClick={() => startRenameRoute(route.id, route.name ?? '')}
                              className="p-0.5 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              title="Renombrar ruta"
                            >
                              <Pencil size={11} />
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-1 shrink-0">
                          {tw && (
                            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                              {tw}
                            </span>
                          )}
                          <div className="relative">
                            <button
                              onClick={() => setMenuRouteId((id) => (id === route.id ? null : route.id))}
                              className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                              title="Opciones"
                            >
                              <MoreHorizontal size={14} />
                            </button>
                            {menuRouteId === route.id && (
                              <div className="absolute right-0 top-7 z-20 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-xs">
                                <button
                                  onClick={() => { setEditRouteId(route.id); setMenuRouteId(null) }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 text-left"
                                >
                                  <Pencil size={12} /> Editar vehiculo/conductor
                                </button>
                                <button
                                  onClick={() => { setDeleteRouteId(route.id); setMenuRouteId(null) }}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-red-50 text-red-600 text-left"
                                >
                                  <Trash2 size={12} /> Eliminar ruta
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-400">
                        {route.driver
                          ? `${route.driver.first_name} ${route.driver.last_name}`
                          : 'Sin conductor'}
                      </div>
                      <div className="flex gap-3 text-xs text-gray-400 mt-1">
                        <span className="flex items-center gap-1">
                          <MapPin size={10} />
                          {route.planStops.length}
                        </span>
                        <span>{Math.round(routeTraveledKm(route, fetchedDistancesKm))}/{Math.round(routePlannedKm(route, fetchedDistancesKm))}km</span>
                        {route.total_duration_minutes != null && route.total_duration_minutes > 0 && (
                          <span>
                            {Math.floor(route.total_duration_minutes / 60)}h {route.total_duration_minutes % 60}m
                          </span>
                        )}
                      </div>
                      {capacity && (
                        <div className="mt-2">
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${capacityBarColor} transition-all`}
                              style={{ width: `${Math.min(capacity.percent, 100)}%` }}
                            />
                          </div>
                          <div className="text-[10px] text-gray-400 mt-0.5">{capacity.label}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sortable stops */}
                  <SortableContext
                    id={route.id}
                    items={route.planStops.map((ps) => ps.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <RouteDropZone id={route.id}>
                      {route.planStops.length === 0 && (
                        <div className="text-[11px] text-gray-400 italic py-2 text-center border border-dashed border-gray-200 rounded">
                          Arrastra paradas aqui
                        </div>
                      )}
                      {route.planStops.map((ps, i) => (
                        <SortablePlanStop
                          key={ps.id}
                          planStop={ps}
                          order={i + 1}
                          color={color}
                          selected={selectedStopId === ps.stop.id}
                          order_obj={ordersByPlanStop.get(ps.id) ?? null}
                          notifLogs={notifLogsByPlanStop.get(ps.id) ?? []}
                          copied={copiedId === ps.id}
                          onSelect={() => handleStopClick(ps.stop)}
                          onCopyLink={() => copyTrackingUrl(ps)}
                          onDelete={() => setDeletePlanStopId(ps.id)}
                        />
                      ))}
                    </RouteDropZone>
                  </SortableContext>
                </div>
              )
            })}

            {/* Unassigned droppable */}
            <div className="border border-gray-100 rounded-lg overflow-hidden bg-white">
              <div className="p-3 flex items-center justify-between bg-gray-50">
                <span className="text-sm font-medium text-gray-600">Sin asignar</span>
                <span className="text-xs text-gray-400">{unassignedStops.length}</span>
              </div>
              <SortableContext
                id={UNASSIGNED_ID}
                items={unassignedStops.map((ps) => ps.id)}
                strategy={verticalListSortingStrategy}
              >
                <RouteDropZone id={UNASSIGNED_ID}>
                  {unassignedStops.length === 0 ? (
                    <div className="text-[11px] text-gray-400 italic py-2 text-center border border-dashed border-gray-200 rounded">
                      Arrastra paradas aqui para desasignar
                    </div>
                  ) : (
                    unassignedStops.map((ps) => (
                      <SortablePlanStop
                        key={ps.id}
                        planStop={ps}
                        order={null}
                        color="#9ca3af"
                        selected={selectedStopId === ps.stop.id}
                        order_obj={ordersByPlanStop.get(ps.id) ?? null}
                        notifLogs={notifLogsByPlanStop.get(ps.id) ?? []}
                        copied={copiedId === ps.id}
                        onSelect={() => handleStopClick(ps.stop)}
                        onCopyLink={() => copyTrackingUrl(ps)}
                        onDelete={() => setDeletePlanStopId(ps.id)}
                      />
                    ))
                  )}
                </RouteDropZone>
              </SortableContext>
            </div>

            {routes.length === 0 && unassignedStops.length === 0 && (
              <div className="text-center py-8 text-gray-400 text-sm">
                <Truck size={32} className="mx-auto mb-2 opacity-40" />
                <p>Agrega vehiculos y paradas</p>
              </div>
            )}

          </div>

          <DragOverlay>
            {activeDragId ? (
              (() => {
                const ps = [...routes.flatMap((r) => r.planStops), ...unassignedStops].find(
                  (p) => p.id === activeDragId,
                )
                return ps ? (
                  <div className="flex items-center gap-2 p-2 text-xs bg-white border border-blue-300 rounded shadow-md">
                    <GripVertical size={12} className="text-gray-400" />
                    <div className="font-medium truncate">{ps.stop.name}</div>
                  </div>
                ) : null
              })()
            ) : null}
          </DragOverlay>
        </DndContext>


        {/* Bottom actions */}
        <div className="p-3 border-t border-gray-200 space-y-2">
          {totalStops >= 2 && routes.length > 0 && (
            <button
              onClick={() => setShowVroomWizard(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              title="Optimiza todas las rutas del plan (multi-vehiculo, capacidad, time windows)"
            >
              Optimizar con Vuoo
            </button>
          )}
          <button
            onClick={() => setShowAddVehicle(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
          >
            <Truck size={14} />
            Agregar vehiculo
          </button>
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
          depot={orgDepot}
        />
      </div>

      {/* Vroom Wizard */}
      {showVroomWizard && planId && (
        <VroomWizardModal
          planId={planId}
          numStops={[...routes.flatMap((r) => r.planStops), ...unassignedStops].filter(
            (ps) => ps.stop.lat && ps.stop.lng,
          ).length}
          numVehicles={routes.length}
          depotAddress={orgDepot?.address ?? null}
          onClose={() => setShowVroomWizard(false)}
          onApplied={() => {
            setShowVroomWizard(false)
            loadPlanData()
          }}
          onDepotMissing={() => {
            setShowVroomWizard(false)
            setShowDepotModal(true)
          }}
        />
      )}

      {/* Depot Config Modal */}
      {/* Activity drawer (timeline realtime) */}
      {showActivity && currentOrg && (
        <div className="fixed inset-y-0 right-0 z-30 w-96 bg-white border-l border-gray-200 shadow-xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-blue-500" />
              <h3 className="text-sm font-semibold">Actividad del plan</h3>
            </div>
            <button
              onClick={() => setShowActivity(false)}
              className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              title="Cerrar"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ActivityTimeline
              orgId={currentOrg.id}
              routeIds={planRouteIds}
              driverNames={planDriverNames}
              stopNames={planStopNames}
              limit={100}
            />
          </div>
        </div>
      )}

      {showDepotModal && currentOrg && (
        <DepotConfigModal
          orgId={currentOrg.id}
          onClose={() => setShowDepotModal(false)}
          onSaved={() => {
            setShowDepotModal(false)
            setShowVroomWizard(true)
            supabase
              .from('organizations')
              .select('default_depot_lat, default_depot_lng, default_depot_address')
              .eq('id', currentOrg.id)
              .single()
              .then(({ data }) => {
                if (data && data.default_depot_lat != null && data.default_depot_lng != null) {
                  setOrgDepot({
                    lat: data.default_depot_lat,
                    lng: data.default_depot_lng,
                    address: data.default_depot_address ?? null,
                  })
                }
              })
          }}
        />
      )}

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

      {/* Edit Route Modal */}
      {editRouteId && currentOrg && (() => {
        const route = routes.find((r) => r.id === editRouteId)
        if (!route) return null
        return (
          <EditRouteModal
            route={{
              id: route.id,
              vehicle_id: route.vehicle_id,
              driver_id: route.driver_id,
              plan: plan ? { name: plan.name, date: plan.date } : null,
            }}
            orgId={currentOrg.id}
            onClose={() => setEditRouteId(null)}
            onSaved={() => {
              setEditRouteId(null)
              loadPlanData()
            }}
          />
        )
      })()}

      {/* Delete confirmations */}
      <ConfirmDialog
        open={deletePlanStopId !== null}
        title="Eliminar parada del plan"
        message="Esta parada se quitara del plan. La parada sigue existiendo en la libreria de stops."
        confirmLabel="Eliminar"
        variant="danger"
        onConfirm={confirmDeletePlanStop}
        onCancel={() => setDeletePlanStopId(null)}
      />
      <ConfirmDialog
        open={deleteRouteId !== null}
        title="Eliminar ruta"
        message="Las paradas asignadas a esta ruta quedaran sin asignar. El vehiculo y conductor se liberan."
        confirmLabel="Eliminar ruta"
        variant="danger"
        onConfirm={confirmDeleteRoute}
        onCancel={() => setDeleteRouteId(null)}
      />

      {editRouteId &&
        currentOrg &&
        (() => {
          const target = routes.find((r) => r.id === editRouteId)
          if (!target) return null
          return (
            <EditRouteModal
              route={{
                id: target.id,
                vehicle_id: target.vehicle_id,
                driver_id: target.driver_id,
                plan: plan ? { name: plan.name, date: plan.date } : null,
              }}
              orgId={currentOrg.id}
              onClose={() => setEditRouteId(null)}
              onSaved={() => {
                setEditRouteId(null)
                loadPlanData()
              }}
            />
          )
        })()}
    </div>
  )
}







