import type { ReactNode } from 'react'
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import type { Delta } from '@/application/utils/analyticsFormat'

interface Props {
  label: string
  value: ReactNode
  delta?: Delta | null
  deltaLabel?: string
  icon?: ReactNode
  hint?: string
  invertDelta?: boolean
  valueColor?: string
}

export function KPICard({ label, value, delta, deltaLabel, icon, hint, invertDelta, valueColor }: Props) {
  const renderDelta = () => {
    if (!delta) return null
    if (delta.direction === 'flat') {
      return (
        <span className="flex items-center gap-0.5 text-xs text-gray-400">
          <Minus size={12} />
          Sin cambio
        </span>
      )
    }
    const isPositive = invertDelta ? delta.direction === 'down' : delta.direction === 'up'
    const color = isPositive ? 'text-green-600' : 'text-red-500'
    const Icon = delta.direction === 'up' ? ArrowUpRight : ArrowDownRight
    const pctText = delta.percent != null ? `${delta.percent > 0 ? '+' : ''}${delta.percent.toFixed(1)}%` : '—'
    return (
      <span className={`flex items-center gap-0.5 text-xs font-medium ${color}`}>
        <Icon size={12} />
        {pctText}
        {deltaLabel && <span className="text-gray-400 ml-1 font-normal">{deltaLabel}</span>}
      </span>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">{label}</span>
        {icon && <span className="text-gray-300">{icon}</span>}
      </div>
      <div className={`text-2xl font-bold ${valueColor ?? 'text-gray-900'}`}>{value}</div>
      <div className="mt-2 min-h-[16px]">{renderDelta()}</div>
      {hint && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
    </div>
  )
}
