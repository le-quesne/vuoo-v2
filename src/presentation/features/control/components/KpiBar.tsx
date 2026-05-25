import type { JSX } from 'react'
import { Radio, CheckCircle2, Truck } from 'lucide-react'
import type { LiveDashboard } from '@/data/services/liveControl.services'

interface KpiBarProps {
  dashboard: LiveDashboard | null
  loading: boolean
}

export default function KpiBar({ dashboard, loading }: KpiBarProps) {
  if (loading && dashboard === null) {
    return (
      <div className="flex items-center gap-8 text-xs">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-4 w-28 bg-gray-100 rounded animate-pulse" />
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

  const iconClass = 'w-3.5 h-3.5 text-gray-400'

  const cells: Array<{
    icon: JSX.Element
    label: string
    value: string
    detail?: string
  }> = [
    {
      icon: <Radio className={iconClass} />,
      label: 'Online',
      value: `${drivers_online}/${drivers_total}`,
    },
    {
      icon: <CheckCircle2 className={iconClass} />,
      label: 'Paradas',
      value: `${stops_completed}/${stops_total}`,
      detail:
        stops_failed > 0
          ? `${stops_failed} fallidas`
          : stops_pending > 0
            ? `${stops_pending} pendientes`
            : undefined,
    },
    {
      icon: <Truck className={iconClass} />,
      label: 'Rutas',
      value: `${routes_active} activas`,
      detail: routes_completed > 0 ? `${routes_completed} completadas` : undefined,
    },
  ]

  return (
    <div className="flex items-center gap-x-8 gap-y-1 flex-wrap text-xs">
      {cells.map((cell, i) => (
        <div key={i} className="inline-flex items-center gap-1.5">
          {cell.icon}
          <span className="text-gray-500">{cell.label}</span>
          <span className="font-semibold text-gray-900 tabular-nums">{cell.value}</span>
          {cell.detail && (
            <span className="text-gray-400 ml-1">· {cell.detail}</span>
          )}
        </div>
      ))}
    </div>
  )
}
