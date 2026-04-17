import {
  Battery,
  CheckCircle2,
  Clock,
  Gauge,
  MapPin,
  MessageCircle,
  Radio,
  Shuffle,
  WifiOff,
  XCircle,
} from 'lucide-react'
import {
  formatAge,
  getLiveRouteState,
  getStateColor,
  type LiveRoute,
  type LiveRouteState,
} from '../../lib/liveControl'
import type { Stop } from '../../types/database'

interface LiveRouteCardProps {
  route: LiveRoute
  color: string
  nowMs: number
  selected: boolean
  onSelect: () => void
  pendingStops?: Array<{ planStopId: string; stop: Stop }>
  onContact?: () => void
  onReassignStop?: (planStopId: string, planStopName: string) => void
}

const STATE_LABEL: Record<LiveRouteState, string> = {
  in_transit: 'En ruta',
  offline: 'Offline',
  completed: 'Completada',
  not_started: 'No iniciada',
}

function getBatteryColor(battery: number): string {
  if (battery > 0.5) return 'text-emerald-600'
  if (battery > 0.2) return 'text-amber-600'
  return 'text-red-600'
}

export function LiveRouteCard({
  route,
  color,
  nowMs,
  selected,
  onSelect,
  pendingStops = [],
  onContact,
  onReassignStop,
}: LiveRouteCardProps) {
  const state = getLiveRouteState(route, nowMs)
  const stateLabel = STATE_LABEL[state]
  const stateClasses = getStateColor(state)

  const total = route.stops_total
  const completed = route.stops_completed
  const failed = route.stops_failed
  const pending = Math.max(total - completed - failed, 0)

  const completedPct = total > 0 ? (completed / total) * 100 : 0
  const failedPct = total > 0 ? (failed / total) * 100 : 0

  const driverName = route.driver?.name ?? 'Sin conductor'
  const vehicleLabel = route.vehicle ? route.vehicle.name : 'Sin vehiculo'

  const lastLocation = route.last_location
  const battery = lastLocation?.battery ?? null
  const speed = lastLocation?.speed ?? null

  const containerClasses = [
    'relative rounded-lg border bg-white overflow-hidden cursor-pointer transition-colors',
    selected
      ? 'border-gray-200 ring-2 ring-blue-400'
      : 'border-gray-200 hover:border-gray-300',
  ].join(' ')

  return (
    <div
      className={containerClasses}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <div
        className="absolute top-0 left-0 bottom-0 w-1"
        style={{ backgroundColor: color }}
      />

      <div className="pl-4 pr-3 py-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <Radio
              className="h-3.5 w-3.5 shrink-0"
              style={{ color }}
            />
            <span className="font-semibold text-sm text-gray-900 truncate">
              {driverName}
            </span>
          </div>
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full inline-flex items-center gap-1 shrink-0 ${stateClasses}`}
          >
            {state === 'offline' && (
              <WifiOff className="h-3 w-3 text-red-600 animate-pulse" />
            )}
            {stateLabel}
          </span>
        </div>

        <div className="text-xs text-gray-500 truncate mb-2">
          {vehicleLabel} &middot; {route.plan_name}
        </div>

        <div className="mb-2">
          <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-emerald-500"
              style={{ width: `${completedPct}%` }}
            />
            <div
              className="absolute top-0 h-full bg-red-500"
              style={{
                left: `${completedPct}%`,
                width: `${failedPct}%`,
              }}
            />
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            {completed}/{total} paradas
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] mb-2 flex-wrap">
          {lastLocation ? (
            <span className="inline-flex items-center gap-1 text-gray-600">
              <MapPin className="h-3 w-3" />
              Ultima senal: {formatAge(nowMs, lastLocation.recorded_at)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-red-600">
              <MapPin className="h-3 w-3" />
              Sin senal reportada
            </span>
          )}
        </div>

        {lastLocation && (battery !== null || (speed !== null && speed > 0)) && (
          <div className="flex items-center gap-3 text-[11px] mb-2 flex-wrap">
            {battery !== null && (
              <span
                className={`inline-flex items-center gap-1 ${getBatteryColor(battery)}`}
              >
                <Battery className="h-3 w-3" />
                {Math.round(battery * 100)}%
              </span>
            )}
            {speed !== null && speed > 0 && (
              <span className="inline-flex items-center gap-1 text-gray-600">
                <Gauge className="h-3 w-3" />
                {Math.round(speed * 3.6)} km/h
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {completed}
          </span>
          <span className="inline-flex items-center gap-1">
            <XCircle className="h-3.5 w-3.5" />
            {failed}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {pending}
          </span>
        </div>

        {selected && (onContact || onReassignStop) && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2" onClick={(e) => e.stopPropagation()}>
            {onContact && route.driver && (
              <button
                onClick={onContact}
                className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                <MessageCircle size={12} />
                Contactar a {route.driver.name}
              </button>
            )}
            {onReassignStop && pendingStops.length > 0 && (
              <div>
                <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Reasignar parada
                </div>
                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                  {pendingStops.slice(0, 8).map((ps) => (
                    <button
                      key={ps.planStopId}
                      onClick={() => onReassignStop(ps.planStopId, ps.stop.name)}
                      className="w-full flex items-center gap-1.5 text-[11px] px-2 py-1 rounded hover:bg-blue-50 text-left text-gray-600"
                    >
                      <Shuffle size={10} className="text-gray-400 shrink-0" />
                      <span className="truncate">{ps.stop.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
