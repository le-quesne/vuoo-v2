import { useState } from 'react'
import {
  AlertCircle,
  BatteryLow,
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  OctagonPause,
  Play,
  WifiOff,
  XCircle,
} from 'lucide-react'
import type { LiveAlert, AlertPriority, AlertType } from '@/data/services/liveControl.services'
import { formatAge } from '@/data/services/liveControl.services'

interface AlertFeedProps {
  alerts: LiveAlert[]
  nowMs: number
  onAcknowledge: (alertId: string) => void
  onSelect?: (alert: LiveAlert) => void
}

type FilterValue = 'all' | 'high' | 'medium' | 'info'

const PRIORITY_DOT: Record<AlertPriority, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-400',
  info: 'bg-emerald-500',
}

function TypeIcon({ type }: { type: AlertType }) {
  const cls = 'text-gray-400 shrink-0'
  switch (type) {
    case 'driver_offline':
      return <WifiOff size={12} className={cls} />
    case 'driver_stationary':
      return <OctagonPause size={12} className={cls} />
    case 'stop_late':
      return <Clock size={12} className={cls} />
    case 'stop_failed':
      return <XCircle size={12} className={cls} />
    case 'stop_completed':
      return <CheckCircle2 size={12} className={cls} />
    case 'route_not_started':
      return <AlertCircle size={12} className={cls} />
    case 'route_started':
      return <Play size={12} className={cls} />
    case 'route_completed':
      return <CheckCheck size={12} className={cls} />
    case 'battery_low':
      return <BatteryLow size={12} className={cls} />
    default:
      return null
  }
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
        active
          ? 'bg-gray-900 text-white border-gray-900'
          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  )
}

function AlertFeed({ alerts, nowMs, onAcknowledge, onSelect }: AlertFeedProps) {
  const [filter, setFilter] = useState<FilterValue>('all')

  const highUnacknowledgedCount = alerts.filter(
    (a) => a.priority === 'high' && !a.acknowledged,
  ).length

  const filtered = alerts.filter((alert) => {
    if (filter === 'all') return true
    return alert.priority === filter
  })

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden flex flex-col min-h-0">
      <div className="border-b border-gray-200 px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Alertas</h3>
          {highUnacknowledgedCount > 0 && (
            <span className="bg-red-100 text-red-700 text-[10px] rounded-full px-1.5">
              {highUnacknowledgedCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <FilterChip
            label="Todas"
            active={filter === 'all'}
            onClick={() => setFilter('all')}
          />
          <FilterChip
            label="Alta"
            active={filter === 'high'}
            onClick={() => setFilter('high')}
          />
          <FilterChip
            label="Media"
            active={filter === 'medium'}
            onClick={() => setFilter('medium')}
          />
          <FilterChip
            label="Info"
            active={filter === 'info'}
            onClick={() => setFilter('info')}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full py-8 px-3">
            <p className="text-xs text-gray-400 text-center">
              Sin eventos todavía
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((alert) => {
              const isHighUnack =
                alert.priority === 'high' && !alert.acknowledged
              const baseClasses =
                'px-3 py-2 flex items-start gap-2 cursor-pointer hover:bg-gray-50 transition-colors'
              const highlightClasses = isHighUnack
                ? 'border-l-2 border-red-400 bg-red-50/50'
                : ''
              const ackClasses = alert.acknowledged ? 'opacity-60' : ''

              const handleClick = () => {
                if (onSelect) onSelect(alert)
              }

              return (
                <li
                  key={alert.id}
                  onClick={handleClick}
                  className={`${baseClasses} ${highlightClasses} ${ackClasses}`}
                >
                  <span
                    className={`mt-1 w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[alert.priority]}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-1.5">
                      <TypeIcon type={alert.type} />
                      <p
                        className="text-xs text-gray-800 leading-snug overflow-hidden"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {alert.message}
                      </p>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {formatAge(nowMs, new Date(alert.ts).toISOString())}
                    </p>
                  </div>
                  {isHighUnack && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        onAcknowledge(alert.id)
                      }}
                      className="shrink-0 p-1 rounded hover:bg-red-100 text-red-600 transition-colors"
                      aria-label="Acknowledge alert"
                    >
                      <Check size={14} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

export default AlertFeed
