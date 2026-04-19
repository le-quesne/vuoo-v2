import { useEffect, useMemo, useRef, useState } from 'react'
import { format, addDays, subDays, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Activity,
  AlertTriangle,
  Bell,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  Radio,
  Search,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { supabase } from '@/application/lib/supabase'
import { useAuth } from '@/application/hooks/useAuth'
import { RouteMap, ROUTE_COLORS } from '@/presentation/components/RouteMap'
import KpiBar from '@/presentation/components/control/KpiBar'
import { LiveRouteCard } from '@/presentation/components/control/LiveRouteCard'
import AlertFeed from '@/presentation/components/control/AlertFeed'
import AlertToastStack from '@/presentation/components/control/AlertToast'
import BroadcastModal from '@/presentation/components/control/BroadcastModal'
import IncidentModal from '@/presentation/components/control/IncidentModal'
import ContactDriverMenu from '@/presentation/components/control/ContactDriverMenu'
import { ReassignStopModal } from '@/presentation/components/control/ReassignStopModal'
import {
  sortLiveRoutes,
  getLiveRouteState,
  derivedAlertsFromRoutes,
  alertRowToLive,
  type AlertRow,
  type PendingStopInfo,
  mergeAlerts,
  type LiveRoute,
  type LiveDashboard,
  type LiveLocation,
  type LiveAlert,
} from '@/data/services/liveControl.services'
import { isAlertSoundMuted, setAlertSoundMuted, playAlertBeep } from '@/application/lib/alertSound'
import type { Stop, DriverLocation, DriverAvailability, RouteStatus } from '@/data/types/database'

type FilterKey = 'all' | 'in_transit' | 'problems' | 'offline' | 'completed'
type PlanStopEntry = { planStopId: string; status: string; stop: Stop }

const DASHBOARD_POLL_MS = 30_000
const NOW_TICK_MS = 5_000
const DERIVED_ALERT_MS = 30_000

export function ControlPage() {
  const { currentOrg, user } = useAuth()
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [dashboard, setDashboard] = useState<LiveDashboard | null>(null)
  const [routesLive, setRoutesLive] = useState<LiveRoute[]>([])
  const [planStopsByRoute, setPlanStopsByRoute] = useState<Record<string, PlanStopEntry[]>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [alerts, setAlerts] = useState<LiveAlert[]>([])
  const [toastQueue, setToastQueue] = useState<LiveAlert[]>([])
  const [muted, setMuted] = useState<boolean>(() => isAlertSoundMuted())
  const [orgDepot, setOrgDepot] = useState<{ lat: number; lng: number; address: string | null } | null>(null)
  const [showAlerts, setShowAlerts] = useState(false)
  const alertsRef = useRef<HTMLDivElement | null>(null)
  const [showBroadcast, setShowBroadcast] = useState(false)
  const [showIncident, setShowIncident] = useState(false)
  const [contactRouteId, setContactRouteId] = useState<string | null>(null)
  const [reassignTarget, setReassignTarget] = useState<{ planStopId: string; name: string; routeId: string } | null>(null)
  const [presentUsers, setPresentUsers] = useState<Array<{ user_id: string; email: string | null }>>([])
  const routesRef = useRef<LiveRoute[]>([])
  routesRef.current = routesLive
  const planStopsByRouteRef = useRef<Record<string, PlanStopEntry[]>>({})
  planStopsByRouteRef.current = planStopsByRoute
  const knownAlertIdsRef = useRef<Set<string>>(new Set())
  const stationarySinceRef = useRef<Record<string, number>>({})

  function pushAlerts(incoming: LiveAlert[]) {
    if (incoming.length === 0) return
    setAlerts((prev) => {
      const merged = mergeAlerts(prev, incoming)
      const newHighs = incoming.filter(
        (a) => a.priority === 'high' && !knownAlertIdsRef.current.has(a.id),
      )
      incoming.forEach((a) => knownAlertIdsRef.current.add(a.id))
      if (newHighs.length > 0) {
        setToastQueue((q) => {
          const next = [...newHighs, ...q].slice(0, 3)
          return next
        })
        playAlertBeep()
      }
      return merged
    })
  }

  function acknowledgeAlert(alertId: string) {
    // UI optimista: marcamos local + removemos del toast queue inmediato.
    setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a)))
    setToastQueue((q) => q.filter((a) => a.id !== alertId))
    // Persistir (si la alert tiene UUID de DB; las derivadas client-side
    // usan IDs tipo `offline-routeId` que no son uuids — las ignoramos).
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(alertId)
    if (!isUuid || !user?.id) return
    supabase
      .from('alerts')
      .update({ acknowledged_by: user.id, acknowledged_at: new Date().toISOString() })
      .eq('id', alertId)
      .then(() => {})
  }

  function dismissToast(alertId: string) {
    setToastQueue((q) => q.filter((a) => a.id !== alertId))
  }

  function toggleMute() {
    const next = !muted
    setMuted(next)
    setAlertSoundMuted(next)
  }

  const dateStr = format(selectedDate, 'yyyy-MM-dd')
  const orgId = currentOrg?.id ?? null

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), NOW_TICK_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!showAlerts) return
    function handleClick(e: MouseEvent) {
      if (alertsRef.current && !alertsRef.current.contains(e.target as Node)) {
        setShowAlerts(false)
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowAlerts(false)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [showAlerts])

  const highUnackedCount = useMemo(
    () => alerts.filter((a) => a.priority === 'high' && !a.acknowledged).length,
    [alerts],
  )

  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    supabase
      .from('organizations')
      .select('default_depot_lat, default_depot_lng, default_depot_address')
      .eq('id', orgId)
      .single()
      .then(({ data }) => {
        if (cancelled) return
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
    return () => {
      cancelled = true
    }
  }, [orgId])

  async function loadDashboard() {
    if (!orgId) return
    const { data, error } = await supabase.rpc('get_live_dashboard', {
      p_org_id: orgId,
      p_date: dateStr,
    })
    if (!error && data) setDashboard(data as LiveDashboard)
  }

  async function loadRoutes() {
    if (!orgId) return
    const { data, error } = await supabase.rpc('get_live_routes', {
      p_org_id: orgId,
      p_date: dateStr,
    })
    if (error) return
    const list = (data ?? []) as LiveRoute[]
    setRoutesLive(list)

    const routeIds = list.map((r) => r.route_id)
    if (routeIds.length === 0) {
      setPlanStopsByRoute({})
      return
    }
    const { data: stops } = await supabase
      .from('plan_stops')
      .select('id, route_id, status, stop:stops(*)')
      .in('route_id', routeIds)
      .order('order_index')
    const grouped: Record<string, PlanStopEntry[]> = {}
    for (const row of (stops ?? []) as Array<{
      id: string
      route_id: string
      status: string
      stop: Stop
    }>) {
      if (!row.stop) continue
      const key = row.route_id
      if (!grouped[key]) grouped[key] = []
      grouped[key].push({ planStopId: row.id, status: row.status, stop: row.stop })
    }
    setPlanStopsByRoute(grouped)
  }

  useEffect(() => {
    if (!orgId) return
    setLoading(true)
    Promise.all([loadDashboard(), loadRoutes()]).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, dateStr])

  useEffect(() => {
    if (!orgId) return
    const id = setInterval(loadDashboard, DASHBOARD_POLL_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, dateStr])

  useEffect(() => {
    function tick() {
      const pendingStops: PendingStopInfo[] = []
      for (const [routeId, entries] of Object.entries(planStopsByRouteRef.current)) {
        for (const e of entries) {
          if (e.status !== 'pending') continue
          if (!e.stop.time_window_end) continue
          pendingStops.push({
            planStopId: e.planStopId,
            routeId,
            name: e.stop.name,
            timeWindowEnd: e.stop.time_window_end,
          })
        }
      }
      const derived = derivedAlertsFromRoutes(routesRef.current, Date.now(), {
        pendingStops,
        stationarySince: stationarySinceRef.current,
      })
      if (derived.length > 0) pushAlerts(derived)
    }
    tick()
    const id = setInterval(tick, DERIVED_ALERT_MS)
    return () => clearInterval(id)
  }, [orgId, dateStr])

  useEffect(() => {
    if (!orgId || routesLive.length === 0) return
    const driverIds = routesLive.map((r) => r.driver?.id).filter((x): x is string => Boolean(x))
    const routeIds = routesLive.map((r) => r.route_id)

    const channel = supabase
      .channel(`control-${orgId}-${dateStr}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'driver_locations' },
        (payload) => {
          const row = payload.new as DriverLocation | undefined
          if (!row || !row.driver_id || !driverIds.includes(row.driver_id)) return
          const route = routesRef.current.find((r) => r.driver?.id === row.driver_id)
          if (route) {
            const speed = row.speed ?? null
            if (speed !== null && speed === 0) {
              if (!stationarySinceRef.current[route.route_id]) {
                stationarySinceRef.current[route.route_id] = Date.now()
              }
            } else {
              delete stationarySinceRef.current[route.route_id]
              knownAlertIdsRef.current.delete(`stationary-${route.route_id}`)
            }
          }
          setRoutesLive((prev) =>
            prev.map((r) => {
              if (r.driver?.id !== row.driver_id) return r
              const next: LiveLocation = {
                lat: row.lat,
                lng: row.lng,
                speed: row.speed ?? null,
                battery: row.battery ?? null,
                recorded_at: row.recorded_at ?? new Date().toISOString(),
              }
              if (r.last_location && r.last_location.recorded_at >= next.recorded_at) return r
              return { ...r, last_location: next }
            }),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'plan_stops', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new as
            | { id: string; route_id: string | null; status: string; stop_id: string }
            | undefined
          if (!row || !row.route_id || !routeIds.includes(row.route_id)) return
          // Las alerts de stop_completed / stop_failed las genera un trigger
          // SQL (ver migration 018) y llegan por el canal `alerts-${orgId}`.
          // Aquí solo refrescamos las KPIs y el listado de rutas.
          loadRoutes()
          loadDashboard()
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'routes', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new as { id: string; status: RouteStatus } | undefined
          if (!row || !routeIds.includes(row.id)) return
          // route_started / route_completed las genera un trigger SQL.
          setRoutesLive((prev) =>
            prev.map((r) => (r.route_id === row.id ? { ...r, route_status: row.status } : r)),
          )
          loadDashboard()
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'drivers' },
        (payload) => {
          const row = payload.new as
            | { id: string; availability?: DriverAvailability; availability_updated_at?: string | null }
            | undefined
          if (!row || !driverIds.includes(row.id)) return
          if (row.availability === undefined) return
          setRoutesLive((prev) =>
            prev.map((r) =>
              r.driver?.id === row.id && r.driver
                ? {
                    ...r,
                    driver: {
                      ...r.driver,
                      availability: row.availability!,
                      availability_updated_at: row.availability_updated_at ?? null,
                    },
                  }
                : r,
            ),
          )
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, dateStr, routesLive.length])

  // Presence: qué dispatchers están viendo la Torre ahora. Muestra un
  // avatar stack en el header. Usa Supabase Realtime Presence (no
  // postgres_changes) — estado efímero que desaparece al desconectarse.
  useEffect(() => {
    if (!orgId || !user?.id) return

    const channel = supabase.channel(`presence-control-${orgId}`, {
      config: { presence: { key: user.id } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ user_id: string; email: string | null }>()
        const flat = Object.values(state)
          .flat()
          .map((p) => ({ user_id: p.user_id, email: p.email ?? null }))
        // Deduplicar por user_id (mismo user con múltiples pestañas)
        const uniq = Array.from(new Map(flat.map((p) => [p.user_id, p])).values())
        setPresentUsers(uniq)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: user.id, email: user.email ?? null })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [orgId, user?.id, user?.email])

  // Alertas persistidas: carga inicial (últimas 50 del org) + suscripción
  // a INSERT/UPDATE. Los triggers SQL de migration 018 crean las rows al
  // cambiar plan_stops/routes/incidents/feedback; acá solo las consumimos
  // y sincronizamos acks entre dispatchers.
  useEffect(() => {
    if (!orgId) return
    let cancelled = false

    supabase
      .from('alerts')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (cancelled || !data) return
        const live = (data as AlertRow[]).map(alertRowToLive)
        // Seed direct (sin pushAlerts) para no disparar beep en la carga.
        setAlerts((prev) => mergeAlerts(prev, live))
        live.forEach((a) => knownAlertIdsRef.current.add(a.id))
      })

    const channel = supabase
      .channel(`alerts-${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new as AlertRow | undefined
          if (!row) return
          pushAlerts([alertRowToLive(row)])
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'alerts', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new as AlertRow | undefined
          if (!row) return
          const acked = row.acknowledged_at !== null
          setAlerts((prev) =>
            prev.map((a) => (a.id === row.id ? { ...a, acknowledged: acked } : a)),
          )
          if (acked) setToastQueue((q) => q.filter((a) => a.id !== row.id))
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [orgId])

  const routeColorById = useMemo(() => {
    const map: Record<string, string> = {}
    routesLive.forEach((r, i) => {
      map[r.route_id] = ROUTE_COLORS[i % ROUTE_COLORS.length]
    })
    return map
  }, [routesLive])

  const filteredRoutes = useMemo(() => {
    const sorted = sortLiveRoutes(routesLive, nowMs)
    const q = search.trim().toLowerCase()
    return sorted.filter((r) => {
      if (q) {
        const hay = `${r.driver?.name ?? ''} ${r.vehicle?.name ?? ''} ${r.plan_name}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      const state = getLiveRouteState(r, nowMs)
      switch (filter) {
        case 'in_transit':
          return state === 'in_transit'
        case 'offline':
          return state === 'offline'
        case 'completed':
          return state === 'completed'
        case 'problems':
          return state === 'offline' || r.stops_failed > 0
        default:
          return true
      }
    })
  }, [routesLive, nowMs, search, filter])

  const mapRouteGroups = useMemo(
    () =>
      routesLive.map((r) => ({
        routeId: r.route_id,
        vehicleName: r.vehicle?.name ?? 'Sin vehiculo',
        stops: (planStopsByRoute[r.route_id] ?? []).map((e) => e.stop),
        color: routeColorById[r.route_id] ?? ROUTE_COLORS[0],
      })),
    [routesLive, planStopsByRoute, routeColorById],
  )

  const mapDriverLocations = useMemo<DriverLocation[]>(() => {
    const now = new Date().toISOString()
    return routesLive
      .map((r) => {
        if (!r.last_location || !r.driver) return null
        return {
          id: `${r.route_id}-loc`,
          driver_id: r.driver.id,
          route_id: r.route_id,
          lat: r.last_location.lat,
          lng: r.last_location.lng,
          speed: r.last_location.speed,
          battery: r.last_location.battery,
          heading: null,
          recorded_at: r.last_location.recorded_at,
          created_at: r.last_location.recorded_at ?? now,
          org_id: orgId ?? '',
        } satisfies DriverLocation
      })
      .filter((x): x is DriverLocation => x !== null)
  }, [routesLive, orgId])

  const driverColorByRouteId = useMemo(() => {
    const m: Record<string, string> = {}
    routesLive.forEach((r, i) => {
      m[r.route_id] = ROUTE_COLORS[i % ROUTE_COLORS.length]
    })
    return m
  }, [routesLive])

  const driverNameByRouteId = useMemo(() => {
    const m: Record<string, string> = {}
    routesLive.forEach((r) => {
      m[r.route_id] = r.driver?.name ?? r.vehicle?.name ?? 'Conductor'
    })
    return m
  }, [routesLive])

  const selectedRoute = useMemo(
    () => routesLive.find((r) => r.route_id === selectedRouteId) ?? null,
    [routesLive, selectedRouteId],
  )

  const selectedStopId = useMemo(() => {
    if (!selectedRoute) return null
    const first = planStopsByRoute[selectedRoute.route_id]?.[0]
    return first?.stop.id ?? null
  }, [selectedRoute, planStopsByRoute])

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="px-6 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity size={20} className="text-blue-500" />
          <h1 className="text-lg font-semibold">Torre de Control</h1>
          <span className="text-sm text-gray-500">
            {isToday(selectedDate)
              ? `Hoy · ${format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}`
              : format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSelectedDate((d) => subDays(d, 1))}
            className="p-2 rounded hover:bg-gray-100 text-gray-500"
            title="Dia anterior"
          >
            <ChevronLeft size={16} />
          </button>
          {!isToday(selectedDate) && (
            <button
              onClick={() => setSelectedDate(new Date())}
              className="px-3 py-1.5 text-xs rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              Hoy
            </button>
          )}
          <button
            onClick={() => setSelectedDate((d) => addDays(d, 1))}
            className="p-2 rounded hover:bg-gray-100 text-gray-500"
            title="Dia siguiente"
          >
            <ChevronRight size={16} />
          </button>
          <span className="ml-3 inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
            <Radio size={11} className="animate-pulse" />
            live
          </span>
          {presentUsers.length > 1 && (
            <div
              className="ml-2 flex items-center -space-x-1.5"
              title={`${presentUsers.length} dispatchers viendo ahora: ${presentUsers
                .map((u) => u.email ?? u.user_id.slice(0, 8))
                .join(', ')}`}
            >
              {presentUsers.slice(0, 4).map((u) => {
                const initial = (u.email ?? u.user_id).charAt(0).toUpperCase()
                return (
                  <div
                    key={u.user_id}
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold border-2 border-white ${
                      u.user_id === user?.id ? 'bg-blue-500' : 'bg-gray-400'
                    }`}
                  >
                    {initial}
                  </div>
                )
              })}
              {presentUsers.length > 4 && (
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-gray-600 text-[10px] font-bold border-2 border-white bg-gray-100">
                  +{presentUsers.length - 4}
                </div>
              )}
            </div>
          )}
          <button
            onClick={toggleMute}
            className="ml-2 p-2 rounded hover:bg-gray-100 text-gray-500"
            title={muted ? 'Activar sonido de alertas' : 'Silenciar alertas'}
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <div className="relative ml-2" ref={alertsRef}>
            <button
              onClick={() => setShowAlerts((v) => !v)}
              className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border ${
                showAlerts
                  ? 'border-gray-300 bg-gray-100 text-gray-900'
                  : 'border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
              title="Alertas"
            >
              <Bell size={14} />
              Alertas
              {highUnackedCount > 0 && (
                <span className="ml-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold">
                  {highUnackedCount}
                </span>
              )}
            </button>
            {showAlerts && (
              <div className="absolute right-0 top-full mt-2 z-40 w-[360px] max-h-[70vh] shadow-xl rounded-lg overflow-hidden">
                <AlertFeed
                  alerts={alerts}
                  nowMs={nowMs}
                  onAcknowledge={acknowledgeAlert}
                  onSelect={(alert) => {
                    if (alert.routeId) setSelectedRouteId(alert.routeId)
                    setShowAlerts(false)
                  }}
                />
              </div>
            )}
          </div>
          <button
            onClick={() => setShowBroadcast(true)}
            className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            title="Enviar mensaje a todos los conductores en ruta"
          >
            <Megaphone size={14} />
            Mensaje
          </button>
          <button
            onClick={() => setShowIncident(true)}
            className="ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
            title="Registrar incidente"
          >
            <AlertTriangle size={14} />
            Incidente
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="px-6 py-2 border-b border-gray-100 bg-gray-50/50">
        <KpiBar dashboard={dashboard} loading={loading} />
      </div>

      {/* Panel + Map */}
      <div className="flex-1 flex px-6 py-3 gap-3 min-h-0">
        {/* Left panel */}
        <div className="w-[360px] flex flex-col gap-2 min-h-0">
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar conductor, vehiculo o plan..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div className="flex gap-1 overflow-x-auto">
              {([
                { key: 'all', label: 'Todos' },
                { key: 'in_transit', label: 'En ruta' },
                { key: 'problems', label: 'Problemas' },
                { key: 'offline', label: 'Offline' },
                { key: 'completed', label: 'Completadas' },
              ] as Array<{ key: FilterKey; label: string }>).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-2.5 py-1 text-xs rounded-full border whitespace-nowrap ${
                    filter === f.key
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
            {loading && routesLive.length === 0 && (
              <div className="text-sm text-gray-400 text-center py-8">Cargando rutas...</div>
            )}
            {!loading && filteredRoutes.length === 0 && (
              <div className="text-sm text-gray-400 text-center py-8">
                {routesLive.length === 0 ? 'Sin rutas para este dia.' : 'Sin resultados.'}
              </div>
            )}
            {filteredRoutes.map((r) => {
              const isSelected = selectedRouteId === r.route_id
              const pending = (planStopsByRoute[r.route_id] ?? [])
                .filter((e) => e.status === 'pending')
                .map((e) => ({ planStopId: e.planStopId, stop: e.stop }))
              return (
                <div key={r.route_id} className="relative">
                  <LiveRouteCard
                    route={r}
                    color={routeColorById[r.route_id] ?? ROUTE_COLORS[0]}
                    nowMs={nowMs}
                    selected={isSelected}
                    onSelect={() =>
                      setSelectedRouteId((id) => (id === r.route_id ? null : r.route_id))
                    }
                    pendingStops={pending}
                    onContact={r.driver ? () => setContactRouteId(r.route_id) : undefined}
                    onReassignStop={(planStopId, name) =>
                      setReassignTarget({ planStopId, name, routeId: r.route_id })
                    }
                  />
                  {contactRouteId === r.route_id && r.driver && (
                    <ContactDriverMenu
                      driver={{ id: r.driver.id, name: r.driver.name, phone: r.driver.phone }}
                      onClose={() => setContactRouteId(null)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 rounded-lg overflow-hidden border border-gray-200 min-h-0">
          <RouteMap
            routeGroups={mapRouteGroups}
            driverLocations={mapDriverLocations}
            driverColorByRouteId={driverColorByRouteId}
            driverNameByRouteId={driverNameByRouteId}
            selectedStopId={selectedStopId}
            depot={orgDepot}
          />
        </div>

      </div>

      <AlertToastStack alerts={toastQueue} onDismiss={dismissToast} />

      {showBroadcast && (
        <BroadcastModal
          routes={routesLive}
          onClose={() => setShowBroadcast(false)}
          onSent={() => setShowBroadcast(false)}
        />
      )}

      {showIncident && orgId && user && (
        <IncidentModal
          orgId={orgId}
          userId={user.id}
          routes={routesLive}
          preselectedRouteId={selectedRouteId}
          onClose={() => setShowIncident(false)}
          onSaved={() => setShowIncident(false)}
        />
      )}

      {reassignTarget && (() => {
        const current = routesLive.find((r) => r.route_id === reassignTarget.routeId)
        const candidates = routesLive
          .filter((r) => r.route_id !== reassignTarget.routeId)
          .map((r) => ({
            route_id: r.route_id,
            driver: r.driver ? { id: r.driver.id, name: r.driver.name } : null,
            stops_total: r.stops_total,
            stops_completed: r.stops_completed,
          }))
        return (
          <ReassignStopModal
            planStopId={reassignTarget.planStopId}
            planStopName={reassignTarget.name}
            currentRouteId={reassignTarget.routeId}
            currentDriverId={current?.driver?.id ?? null}
            candidateRoutes={candidates}
            onClose={() => setReassignTarget(null)}
            onReassigned={() => {
              setReassignTarget(null)
              loadRoutes()
              loadDashboard()
            }}
          />
        )
      })()}
    </div>
  )
}
