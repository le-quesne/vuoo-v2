import {
  Battery,
  Gauge,
  MessageCircle,
  Shuffle,
  WifiOff,
} from 'lucide-react'
import {
  formatAge,
  getLiveRouteState,
  getStateColor,
  type LiveRoute,
  type LiveRouteState,
} from '@/data/services/liveControl.services'
import type { Stop } from '@/data/types/database'
import type { RouteEta } from '@/data/services/control'

interface LiveRouteCardProps {
  route: LiveRoute
  color: string
  nowMs: number
  selected: boolean
  onSelect: () => void
  pendingStops?: Array<{ planStopId: string; stop: Stop }>
  eta?: RouteEta | null
  onContact?: () => void
  onReassignStop?: (planStopId: string, planStopName: string) => void
}

function formatEtaTime(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
}

const STATE_LABEL: Record<LiveRouteState, string> = {
  in_transit: 'En ruta',
  offline: 'Offline',
  on_break: 'En pausa',
  completed: 'Completada',
  not_started: 'No iniciada',
}

function getBatteryColor(battery: number): string {
  if (battery > 0.5) return 'text-gray-500'
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
  eta,
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

  const driverName = route.driver?.name ?? 'Sin conductor'
  const vehicleLabel = route.vehicle ? route.vehicle.name : 'Sin vehículo'

  const lastLocation = route.last_location
  const battery = lastLocation?.battery ?? null
  const speed = lastLocation?.speed ?? null

  const containerClasses = [
    'rounded-md border bg-white cursor-pointer transition-colors',
    selected
      ? 'border-gray-300 ring-1 ring-blue-400'
      : 'border-gray-200 hover:border-gray-300',
  ].join(' ')

  const nextEtaTime = eta && eta.source !== 'none' ? formatEtaTime(eta.nextEta) : null
  const finalEtaTime = eta && eta.source !== 'none' ? formatEtaTime(eta.finalEta) : null

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
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
            <span className="font-medium text-sm text-gray-900 truncate">
              {driverName}
            </span>
            <span className={`text-[11px] font-medium shrink-0 inline-flex items-center gap-1 ${stateClasses}`}>
              {state === 'offline' && <WifiOff className="h-3 w-3" />}
              {stateLabel}
            </span>
          </div>
          <span className="text-xs text-gray-500 tabular-nums shrink-0">
            {completed}/{total}
            {failed > 0 && <span className="text-red-600"> · {failed} ✗</span>}
          </span>
        </div>

        <div className="mt-1 text-xs text-gray-500 truncate">
          {vehicleLabel} · {route.plan_name}
        </div>

        {(nextEtaTime || finalEtaTime) && (
          <div className="mt-1 text-xs text-gray-500 tabular-nums">
            {nextEtaTime && <span>Próx {nextEtaTime}</span>}
            {nextEtaTime && finalEtaTime && <span className="mx-1.5 text-gray-300">·</span>}
            {finalEtaTime && <span>Final {finalEtaTime}</span>}
            {eta?.source === 'plan' && <span className="ml-1.5 text-gray-400">~est</span>}
          </div>
        )}

        <div className="mt-1.5 text-xs text-gray-500">
          {lastLocation
            ? `Última señal · ${formatAge(nowMs, lastLocation.recorded_at)}`
            : <span className="text-red-600">Sin señal reportada</span>}
        </div>

        {selected && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2" onClick={(e) => e.stopPropagation()}>
            {(battery !== null || (speed !== null && speed > 0) || pending > 0) && (
              <div className="flex items-center gap-4 text-xs text-gray-500 tabular-nums">
                {battery !== null && (
                  <span className={`inline-flex items-center gap-1 ${getBatteryColor(battery)}`}>
                    <Battery className="h-3 w-3" />
                    {Math.round(battery * 100)}%
                  </span>
                )}
                {speed !== null && speed > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Gauge className="h-3 w-3" />
                    {Math.round(speed * 3.6)} km/h
                  </span>
                )}
                {pending > 0 && <span>{pending} pendientes</span>}
              </div>
            )}

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
