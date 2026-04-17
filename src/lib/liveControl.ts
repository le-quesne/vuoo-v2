import type { RouteStatus } from '../types/database'

export interface LiveLocation {
  lat: number
  lng: number
  speed: number | null
  battery: number | null
  recorded_at: string
}

export interface LiveDriver {
  id: string
  name: string
  phone: string | null
}

export interface LiveVehicle {
  id: string
  name: string
  plate: string | null
  time_window_start: string | null
  time_window_end: string | null
}

export interface LiveRoute {
  route_id: string
  route_status: RouteStatus
  total_distance_km: number | null
  total_duration_minutes: number | null
  plan_id: string
  plan_name: string
  plan_date: string
  driver: LiveDriver | null
  vehicle: LiveVehicle | null
  stops_total: number
  stops_completed: number
  stops_failed: number
  last_location: LiveLocation | null
}

export interface LiveDashboard {
  drivers_online: number
  drivers_total: number
  stops_total: number
  stops_completed: number
  stops_failed: number
  stops_pending: number
  routes_active: number
  routes_completed: number
}

export const ONLINE_THRESHOLD_MS = 60_000

export function formatAge(now: number, iso: string): string {
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

export function isDriverOnline(location: LiveLocation | null, nowMs: number): boolean {
  if (!location) return false
  return nowMs - Date.parse(location.recorded_at) < ONLINE_THRESHOLD_MS
}

export type LiveRouteState = 'completed' | 'in_transit' | 'not_started' | 'offline'

export function getLiveRouteState(route: LiveRoute, nowMs: number): LiveRouteState {
  if (route.route_status === 'completed') return 'completed'
  if (route.route_status === 'in_transit') {
    if (!isDriverOnline(route.last_location, nowMs)) return 'offline'
    return 'in_transit'
  }
  return 'not_started'
}

export function getStateColor(state: string): string {
  switch (state) {
    case 'in_transit':
      return 'bg-emerald-100 text-emerald-700'
    case 'offline':
      return 'bg-red-100 text-red-700'
    case 'completed':
      return 'bg-blue-100 text-blue-700'
    case 'not_started':
      return 'bg-gray-100 text-gray-600'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

export function sortLiveRoutes(routes: LiveRoute[], nowMs: number): LiveRoute[] {
  const stateOrder: Record<LiveRouteState, number> = {
    offline: 0,
    in_transit: 1,
    not_started: 2,
    completed: 3,
  }

  const getProgress = (route: LiveRoute): number => {
    if (route.stops_total <= 0) return 0
    return route.stops_completed / route.stops_total
  }

  const getDriverName = (route: LiveRoute): string => route.driver?.name ?? ''

  return [...routes].sort((a, b) => {
    const stateA = getLiveRouteState(a, nowMs)
    const stateB = getLiveRouteState(b, nowMs)
    const orderDiff = stateOrder[stateA] - stateOrder[stateB]
    if (orderDiff !== 0) return orderDiff

    if (stateA === 'in_transit') {
      const progressDiff = getProgress(b) - getProgress(a)
      if (progressDiff !== 0) return progressDiff
    }

    return getDriverName(a).localeCompare(getDriverName(b))
  })
}

export type AlertPriority = 'high' | 'medium' | 'info'

export type AlertType =
  | 'driver_offline'
  | 'driver_stationary'
  | 'stop_late'
  | 'stop_failed'
  | 'stop_completed'
  | 'route_not_started'
  | 'route_started'
  | 'route_completed'
  | 'battery_low'

export interface LiveAlert {
  id: string
  priority: AlertPriority
  type: AlertType
  ts: number
  driverId?: string
  routeId?: string
  planStopId?: string
  planStopName?: string
  message: string
  acknowledged?: boolean
}

export const OFFLINE_ALERT_MS = 5 * 60_000
export const ROUTE_LATE_START_MS = 30 * 60_000
export const STATIONARY_ALERT_MS = 15 * 60_000
export const LOW_BATTERY_THRESHOLD = 0.15

export interface PendingStopInfo {
  planStopId: string
  routeId: string
  name: string
  timeWindowEnd: string | null
}

export interface DerivedAlertContext {
  pendingStops?: PendingStopInfo[]
  stationarySince?: Record<string, number>
}

function parseTimeToMs(date: Date, hhmmss: string): number | null {
  const parts = hhmmss.split(':').map((p) => Number(p))
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return null
  const [h, m, s = 0] = parts
  const local = new Date(date)
  local.setHours(h, m, s ?? 0, 0)
  return local.getTime()
}

export function derivedAlertsFromRoutes(
  routes: LiveRoute[],
  nowMs: number,
  ctx: DerivedAlertContext = {},
): LiveAlert[] {
  const alerts: LiveAlert[] = []
  const now = new Date(nowMs)

  for (const route of routes) {
    const driverName = route.driver?.name ?? 'Conductor'
    const driverId = route.driver?.id

    if (route.route_status === 'not_started' && route.vehicle?.time_window_start) {
      const startMs = parseTimeToMs(now, route.vehicle.time_window_start)
      if (startMs !== null && nowMs - startMs > ROUTE_LATE_START_MS) {
        const mins = Math.floor((nowMs - startMs) / 60_000)
        alerts.push({
          id: `route-late-${route.route_id}`,
          priority: 'medium',
          type: 'route_not_started',
          ts: nowMs,
          driverId,
          routeId: route.route_id,
          message: `${driverName} aun no inicia ruta (${mins} min tarde)`,
        })
      }
    }

    if (route.route_status !== 'in_transit') continue

    if (route.last_location === null) {
      alerts.push({
        id: `offline-${route.route_id}`,
        priority: 'high',
        type: 'driver_offline',
        ts: nowMs,
        driverId,
        routeId: route.route_id,
        message: `${driverName} sin señal`,
      })
    } else {
      const recordedAt = Date.parse(route.last_location.recorded_at)
      const ageMs = nowMs - recordedAt
      if (ageMs > OFFLINE_ALERT_MS) {
        const mins = Math.floor(ageMs / 60_000)
        alerts.push({
          id: `offline-${route.route_id}`,
          priority: 'high',
          type: 'driver_offline',
          ts: nowMs,
          driverId,
          routeId: route.route_id,
          message: `${driverName} offline hace ${mins} min`,
        })
      }

      const battery = route.last_location.battery
      if (battery !== null && battery < LOW_BATTERY_THRESHOLD) {
        const pct = Math.round(battery * 100)
        alerts.push({
          id: `battery-${route.route_id}`,
          priority: 'medium',
          type: 'battery_low',
          ts: nowMs,
          driverId,
          routeId: route.route_id,
          message: `${driverName} con bateria baja (${pct}%)`,
        })
      }
    }

    const stationarySince = ctx.stationarySince?.[route.route_id]
    if (stationarySince && nowMs - stationarySince > STATIONARY_ALERT_MS) {
      const mins = Math.floor((nowMs - stationarySince) / 60_000)
      alerts.push({
        id: `stationary-${route.route_id}`,
        priority: 'medium',
        type: 'driver_stationary',
        ts: nowMs,
        driverId,
        routeId: route.route_id,
        message: `${driverName} detenido hace ${mins} min`,
      })
    }
  }

  if (ctx.pendingStops) {
    for (const ps of ctx.pendingStops) {
      if (!ps.timeWindowEnd) continue
      const endMs = parseTimeToMs(now, ps.timeWindowEnd)
      if (endMs === null) continue
      if (nowMs > endMs) {
        const mins = Math.floor((nowMs - endMs) / 60_000)
        alerts.push({
          id: `stop-late-${ps.planStopId}`,
          priority: 'medium',
          type: 'stop_late',
          ts: nowMs,
          routeId: ps.routeId,
          planStopId: ps.planStopId,
          planStopName: ps.name,
          message: `${ps.name} atrasada ${mins} min`,
        })
      }
    }
  }

  return alerts
}

export function makeStopStatusAlert(args: {
  planStopId: string
  planStopName: string
  routeId: string
  status: 'completed' | 'cancelled' | 'incomplete'
  driverName?: string | null
}): LiveAlert {
  const { planStopId, planStopName, routeId, status, driverName } = args
  const name = driverName ?? 'Conductor'
  const ts = Date.now()

  if (status === 'completed') {
    return {
      id: `stop-${status}-${planStopId}-${ts}`,
      priority: 'info',
      type: 'stop_completed',
      ts,
      routeId,
      planStopId,
      planStopName,
      message: `${name} completó: ${planStopName}`,
    }
  }

  return {
    id: `stop-${status}-${planStopId}-${ts}`,
    priority: 'high',
    type: 'stop_failed',
    ts,
    routeId,
    planStopId,
    planStopName,
    message: `${name} falló: ${planStopName}`,
  }
}

export function makeRouteStatusAlert(args: {
  routeId: string
  status: 'in_transit' | 'completed' | 'not_started'
  driverName?: string | null
}): LiveAlert | null {
  const { routeId, status, driverName } = args
  const name = driverName ?? 'Conductor'
  const ts = Date.now()

  if (status === 'in_transit') {
    return {
      id: `route-${status}-${routeId}-${ts}`,
      priority: 'info',
      type: 'route_started',
      ts,
      routeId,
      message: `${name} inició ruta`,
    }
  }

  if (status === 'completed') {
    return {
      id: `route-${status}-${routeId}-${ts}`,
      priority: 'info',
      type: 'route_completed',
      ts,
      routeId,
      message: `${name} completó su ruta`,
    }
  }

  return null
}

export function mergeAlerts(existing: LiveAlert[], incoming: LiveAlert[]): LiveAlert[] {
  const byId = new Map<string, LiveAlert>()

  for (const alert of existing) {
    byId.set(alert.id, alert)
  }

  for (const alert of incoming) {
    const prev = byId.get(alert.id)
    if (prev) {
      byId.set(alert.id, { ...alert, acknowledged: prev.acknowledged })
    } else {
      byId.set(alert.id, alert)
    }
  }

  const merged = Array.from(byId.values()).sort((a, b) => b.ts - a.ts)
  return merged.slice(0, 200)
}
