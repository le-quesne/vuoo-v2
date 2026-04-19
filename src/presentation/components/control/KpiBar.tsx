import { Radio, CheckCircle2, Clock, XCircle, Truck, CheckCheck } from 'lucide-react'
import type { LiveDashboard } from '@/data/services/liveControl.services'

interface KpiBarProps {
  dashboard: LiveDashboard | null
  loading: boolean
}

function driversColor(online: number, total: number): string {
  if (total === 0) return 'text-gray-400'
  const ratio = online / total
  if (ratio >= 0.8) return 'text-green-600'
  if (ratio < 0.5) return 'text-red-600'
  return 'text-yellow-600'
}

export default function KpiBar({ dashboard, loading }: KpiBarProps) {
  if (loading && dashboard === null) {
    return (
      <div className="flex items-center gap-6 flex-wrap text-xs">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (dashboard === null) return null

  const {
    drivers_online,
    drivers_total,
    stops_completed,
    stops_total,
    stops_pending,
    stops_failed,
    routes_active,
    routes_completed,
  } = dashboard

  const driversValueColor = driversColor(drivers_online, drivers_total)
  const pendingValueColor = stops_pending === 0 ? 'text-gray-400' : 'text-gray-900'
  const failedValueColor = stops_failed === 0 ? 'text-gray-400' : 'text-gray-900'
  const iconClass = 'w-4 h-4 text-gray-400'

  const cells: Array<{
    icon: JSX.Element
    value: string
    label: string
    valueColor: string
  }> = [
    {
      icon: <Radio className={iconClass} />,
      value: `${drivers_online}/${drivers_total}`,
      label: 'online',
      valueColor: driversValueColor,
    },
    {
      icon: <CheckCircle2 className={iconClass} />,
      value: `${stops_completed}/${stops_total}`,
      label: 'entregadas',
      valueColor: 'text-gray-900',
    },
    {
      icon: <Clock className={iconClass} />,
      value: String(stops_pending),
      label: 'pendientes',
      valueColor: pendingValueColor,
    },
    {
      icon: <XCircle className={iconClass} />,
      value: String(stops_failed),
      label: 'fallidas',
      valueColor: failedValueColor,
    },
    {
      icon: <Truck className={iconClass} />,
      value: String(routes_active),
      label: 'rutas activas',
      valueColor: 'text-gray-900',
    },
    {
      icon: <CheckCheck className={iconClass} />,
      value: String(routes_completed),
      label: 'completadas',
      valueColor: 'text-gray-900',
    },
  ]

  return (
    <div className="flex items-center gap-x-5 gap-y-1 flex-wrap text-xs">
      {cells.map((cell, i) => (
        <div key={i} className="inline-flex items-center gap-1.5">
          {cell.icon}
          <span className={`font-semibold ${cell.valueColor}`}>{cell.value}</span>
          <span className="text-gray-500">{cell.label}</span>
        </div>
      ))}
    </div>
  )
}
