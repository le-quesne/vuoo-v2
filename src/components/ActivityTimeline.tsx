import { useEffect, useState } from 'react'
import {
  Play,
  CheckCircle2,
  XCircle,
  RefreshCw,
  MapPin,
  UserCog,
  FileText,
  MoveRight,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase } from '../lib/supabase'

interface RouteEventRow {
  id: string
  org_id: string
  route_id: string
  driver_id: string | null
  type: 'created' | 'assigned' | 'started' | 'completed' | 'reopened' | 'cancelled'
  meta: Record<string, unknown>
  created_at: string
}

interface StopEventRow {
  id: string
  org_id: string
  plan_stop_id: string
  route_id: string | null
  driver_id: string | null
  type: 'created' | 'assigned' | 'reassigned' | 'completed' | 'failed' | 'cancelled' | 'reopened'
  meta: Record<string, unknown>
  created_at: string
}

type EventKind = 'route' | 'stop'

interface TimelineItem {
  kind: EventKind
  id: string
  type: string
  created_at: string
  route_id: string | null
  plan_stop_id?: string
  driver_id: string | null
}

interface ActivityTimelineProps {
  orgId: string
  /**
   * Filtrar eventos a una sola ruta. Si se omite, muestra todos los eventos
   * del org (útil para un feed global).
   */
  routeId?: string | null
  /**
   * Filtrar eventos a las rutas de un plan. Si se pasa, se usa en lugar de
   * routeId. Requiere pasar los routeIds resueltos (el componente no
   * consulta el plan).
   */
  routeIds?: string[]
  /**
   * Mapa opcional de driverId → nombre para enriquecer los mensajes.
   */
  driverNames?: Record<string, string>
  /**
   * Mapa opcional de planStopId → nombre de parada para enriquecer.
   */
  stopNames?: Record<string, string>
  limit?: number
}

const EVENT_META: Record<string, { label: string; color: string; Icon: typeof Play }> = {
  'route:created':    { label: 'Ruta creada',     color: 'text-gray-500',     Icon: FileText },
  'route:assigned':   { label: 'Ruta reasignada', color: 'text-indigo-500',   Icon: UserCog },
  'route:started':    { label: 'Ruta iniciada',   color: 'text-emerald-500',  Icon: Play },
  'route:completed':  { label: 'Ruta completa',   color: 'text-blue-500',     Icon: CheckCircle2 },
  'route:reopened':   { label: 'Ruta reabierta',  color: 'text-amber-500',    Icon: RefreshCw },
  'route:cancelled':  { label: 'Ruta cancelada',  color: 'text-red-500',      Icon: XCircle },
  'stop:created':     { label: 'Parada creada',   color: 'text-gray-500',     Icon: MapPin },
  'stop:assigned':    { label: 'Parada asignada', color: 'text-indigo-500',   Icon: UserCog },
  'stop:reassigned':  { label: 'Parada movida',   color: 'text-indigo-500',   Icon: MoveRight },
  'stop:completed':   { label: 'Parada completada', color: 'text-emerald-500', Icon: CheckCircle2 },
  'stop:failed':      { label: 'Parada fallida',  color: 'text-amber-600',    Icon: XCircle },
  'stop:cancelled':   { label: 'Parada cancelada', color: 'text-red-500',     Icon: XCircle },
  'stop:reopened':    { label: 'Parada reabierta', color: 'text-amber-500',   Icon: RefreshCw },
}

export function ActivityTimeline({
  orgId,
  routeId = null,
  routeIds,
  driverNames,
  stopNames,
  limit = 50,
}: ActivityTimelineProps) {
  const [items, setItems] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId) return
    let cancelled = false

    async function load() {
      const scopedRouteIds = routeId ? [routeId] : (routeIds ?? null)

      const routeQuery = supabase
        .from('route_events')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit)

      const stopQuery = supabase
        .from('stop_events')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (scopedRouteIds && scopedRouteIds.length > 0) {
        routeQuery.in('route_id', scopedRouteIds)
        stopQuery.in('route_id', scopedRouteIds)
      } else if (scopedRouteIds && scopedRouteIds.length === 0) {
        // Plan sin rutas — no hay nada que consultar.
        if (!cancelled) {
          setItems([])
          setLoading(false)
        }
        return
      }

      const [{ data: routeRows }, { data: stopRows }] = await Promise.all([
        routeQuery,
        stopQuery,
      ])
      if (cancelled) return

      const merged = mergeAndSort(
        (routeRows ?? []) as RouteEventRow[],
        (stopRows ?? []) as StopEventRow[],
      ).slice(0, limit)

      setItems(merged)
      setLoading(false)
    }

    load()

    // Realtime: INSERT en ambas tablas (filtrado por org_id)
    const channel = supabase
      .channel(`activity-${orgId}${routeId ? `-${routeId}` : ''}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'route_events', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new as RouteEventRow | undefined
          if (!row) return
          if (routeId && row.route_id !== routeId) return
          if (routeIds && !routeIds.includes(row.route_id)) return
          setItems((prev) =>
            [routeRowToItem(row), ...prev].slice(0, limit),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'stop_events', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new as StopEventRow | undefined
          if (!row) return
          if (routeId && row.route_id !== routeId) return
          if (routeIds && row.route_id && !routeIds.includes(row.route_id)) return
          setItems((prev) =>
            [stopRowToItem(row), ...prev].slice(0, limit),
          )
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, routeId, routeIds?.join(',')])

  if (loading) {
    return (
      <div className="p-4 text-xs text-gray-400">Cargando actividad…</div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="p-4 text-xs text-gray-400">
        Sin actividad registrada.
      </div>
    )
  }

  return (
    <ul className="divide-y divide-gray-100">
      {items.map((it) => {
        const meta = EVENT_META[`${it.kind}:${it.type}`]
        if (!meta) return null
        const { Icon, label, color } = meta
        const driverName = it.driver_id ? driverNames?.[it.driver_id] : null
        const stopName = it.plan_stop_id ? stopNames?.[it.plan_stop_id] : null

        return (
          <li key={`${it.kind}-${it.id}`} className="flex items-start gap-2.5 px-4 py-2.5">
            <div className={`mt-0.5 ${color}`}>
              <Icon size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-700 truncate">
                <span className="font-medium">{label}</span>
                {stopName && <span className="text-gray-500"> · {stopName}</span>}
                {driverName && <span className="text-gray-500"> · {driverName}</span>}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">
                {formatDistanceToNow(new Date(it.created_at), { addSuffix: true, locale: es })}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function routeRowToItem(row: RouteEventRow): TimelineItem {
  return {
    kind: 'route',
    id: row.id,
    type: row.type,
    created_at: row.created_at,
    route_id: row.route_id,
    driver_id: row.driver_id,
  }
}

function stopRowToItem(row: StopEventRow): TimelineItem {
  return {
    kind: 'stop',
    id: row.id,
    type: row.type,
    created_at: row.created_at,
    route_id: row.route_id,
    plan_stop_id: row.plan_stop_id,
    driver_id: row.driver_id,
  }
}

function mergeAndSort(
  routeRows: RouteEventRow[],
  stopRows: StopEventRow[],
): TimelineItem[] {
  const all: TimelineItem[] = [
    ...routeRows.map(routeRowToItem),
    ...stopRows.map(stopRowToItem),
  ]
  all.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  return all
}
