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
  Search,
  Link2,
  Send,
  Check,
  Trash2,
  Pencil,
  Settings,
  GripVertical,
  MoreHorizontal,
} from 'lucide-react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCorners,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { RouteMap, ROUTE_COLORS } from '../components/RouteMap'
import { PODModal } from '../components/PODModal'
import { DepotConfigModal } from '../components/DepotConfigModal'
import { VroomWizardModal } from '../components/VroomWizardModal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EditRouteModal } from '../components/EditRouteModal'
import { notifyDriverRouteAssigned } from '../lib/notifyDriver'
import { calculateRouteWeight, getCapacityStatus } from '../lib/capacity'
import { MAPBOX_TOKEN } from '../lib/mapbox'
import type { Plan, Route, Stop, Vehicle, Driver, PlanStopWithStop, NotificationLog, Order } from '../types/database'

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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

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
                <span>{totalDistance.toFixed(1)}km</span>
              </div>
              <div className="flex items-center gap-1">
                <MapPin size={14} />
                <span>{totalStops}</span>
              </div>
            </div>
            <button
              onClick={() => setShowDepotModal(true)}
              className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded border transition-colors shrink-0 ${
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
                        <span>{(route.total_distance_km ?? 0).toFixed(1)}km</span>
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

type OrderLite = Order | null

function SortablePlanStop({
  planStop,
  order,
  color,
  selected,
  order_obj,
  notifLogs,
  copied,
  onSelect,
  onCopyLink,
  onDelete,
}: {
  planStop: PlanStopWithStop
  order: number | null
  color: string
  selected: boolean
  order_obj: OrderLite
  notifLogs: NotificationLog[]
  copied: boolean
  onSelect: () => void
  onCopyLink: () => void
  onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: planStop.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`flex items-center gap-2 p-2 text-xs rounded cursor-pointer ${
        selected ? 'bg-blue-50 ring-1 ring-blue-300' : 'bg-gray-50 hover:bg-gray-100'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="p-0.5 rounded text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing"
        title="Arrastrar"
      >
        <GripVertical size={12} />
      </button>
      {order !== null ? (
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center font-medium text-[10px] text-white shrink-0"
          style={{ backgroundColor: color }}
        >
          {order}
        </span>
      ) : (
        <MapPin size={12} className="text-gray-400 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <div className="font-medium truncate">{planStop.stop.name}</div>
          {order_obj && (
            <span className="font-mono text-[10px] text-blue-600 bg-blue-50 px-1 py-px rounded shrink-0">
              {order_obj.order_number}
            </span>
          )}
        </div>
        <div className="text-gray-400 truncate">{planStop.stop.address ?? ''}</div>
        {order_obj && (
          <div className="text-[10px] text-gray-400 truncate">
            {(() => {
              const itemCount = order_obj.items?.length ?? 0
              const parts: string[] = []
              if (itemCount > 0) parts.push(`${itemCount} item${itemCount === 1 ? '' : 's'}`)
              if (order_obj.total_weight_kg > 0) parts.push(`${order_obj.total_weight_kg} kg`)
              return parts.join(' · ')
            })()}
          </div>
        )}
        {notifLogs.length > 0 && (
          <div className="flex items-center gap-1 mt-0.5">
            {notifLogs.some((l) => l.channel === 'whatsapp') && (
              <span className="w-2 h-2 rounded-full bg-green-500" title="WhatsApp enviado" />
            )}
            {notifLogs.some((l) => l.channel === 'email') && (
              <span className="w-2 h-2 rounded-full bg-blue-500" title="Email enviado" />
            )}
            {notifLogs.some((l) => l.channel === 'sms') && (
              <span className="w-2 h-2 rounded-full bg-purple-500" title="SMS enviado" />
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {planStop.tracking_token && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onCopyLink()
            }}
            className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-blue-600 transition-colors"
            title="Copiar link de seguimiento"
          >
            {copied ? <Check size={12} className="text-green-500" /> : <Link2 size={12} />}
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            // Placeholder: send notification
          }}
          className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-blue-600 transition-colors"
          title="Reenviar notificacion"
        >
          <Send size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
          title="Eliminar del plan"
        >
          <Trash2 size={12} />
        </button>
        <StatusBadge status={planStop.status} />
      </div>
    </div>
  )
}

function RouteDropZone({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`px-3 pb-3 pt-1 space-y-1 min-h-[12px] transition-colors ${isOver ? 'bg-blue-50/50' : ''}`}
    >
      {children}
    </div>
  )
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
    const { data: inserted } = await supabase
      .from('routes')
      .insert({
        plan_id: planId,
        vehicle_id: selectedVehicleId,
        driver_id: selectedDriverId,
        status: 'not_started',
        user_id: user.id,
        org_id: currentOrg.id,
      })
      .select('id, plan:plans(name, date)')
      .single()
    setSaving(false)

    if (inserted?.id && selectedDriverId) {
      const planLite = (inserted as { plan?: { name?: string | null; date?: string | null } | null })
        .plan
      void notifyDriverRouteAssigned({
        driverId: selectedDriverId,
        routeId: inserted.id,
        planName: planLite?.name ?? null,
        planDate: planLite?.date ?? null,
      })
    }

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

function PlanDetailSkeleton() {
  return (
    <div className="flex h-screen">
      <div className="w-96 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-200 space-y-3">
          <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
          <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
          <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex gap-3">
              <div className="h-4 w-14 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-14 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-10 bg-gray-100 rounded animate-pulse" />
            </div>
            <div className="h-6 w-16 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
        <div className="flex-1 overflow-hidden p-2 space-y-2">
          {[0, 1].map((i) => (
            <div key={i} className="border border-gray-100 rounded-lg p-3 space-y-3 bg-white">
              <div className="flex items-start gap-2">
                <div className="w-1 self-stretch rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                  <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
                  <div className="flex gap-3">
                    <div className="h-3 w-10 bg-gray-100 rounded animate-pulse" />
                    <div className="h-3 w-12 bg-gray-100 rounded animate-pulse" />
                    <div className="h-3 w-10 bg-gray-100 rounded animate-pulse" />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                {[0, 1, 2].map((j) => (
                  <div key={j} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                    <div className="w-5 h-5 rounded-full bg-gray-200 animate-pulse" />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 w-28 bg-gray-200 rounded animate-pulse" />
                      <div className="h-2.5 w-40 bg-gray-100 rounded animate-pulse" />
                    </div>
                    <div className="h-4 w-14 bg-gray-100 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-gray-200 space-y-2">
          <div className="h-9 w-full bg-gray-100 rounded-lg animate-pulse" />
          <div className="h-9 w-full bg-gray-100 rounded-lg animate-pulse" />
        </div>
      </div>
      <div className="flex-1 bg-gray-100 animate-pulse" />
    </div>
  )
}

