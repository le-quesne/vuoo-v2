import { useState } from 'react'
import { Calendar } from 'lucide-react'
import type { DatePreset } from '@/application/hooks/useAnalyticsFilters'

interface Props {
  from: string
  to: string
  preset: DatePreset
  onPresetChange: (p: DatePreset) => void
  onRangeChange: (from: string, to: string) => void
}

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: 'Esta semana' },
  { key: 'month', label: 'Este mes' },
  { key: 'last_month', label: 'Ultimo mes' },
]

export function DateRangeFilter({ from, to, preset, onPresetChange, onRangeChange }: Props) {
  const [showCustom, setShowCustom] = useState(preset === 'custom')
  const [localFrom, setLocalFrom] = useState(from)
  const [localTo, setLocalTo] = useState(to)

  function applyCustom() {
    if (localFrom && localTo && localFrom <= localTo) {
      onRangeChange(localFrom, localTo)
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1 bg-gray-100 rounded-full p-1">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => {
              setShowCustom(false)
              onPresetChange(p.key)
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              preset === p.key
                ? 'bg-blue-500 text-white shadow-sm'
                : 'text-gray-600 hover:bg-white'
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setShowCustom((s) => !s)}
          className={`px-3 py-1.5 text-xs font-medium rounded-full flex items-center gap-1 transition-colors ${
            preset === 'custom'
              ? 'bg-blue-500 text-white shadow-sm'
              : 'text-gray-600 hover:bg-white'
          }`}
        >
          <Calendar size={12} />
          Custom
        </button>
      </div>

      {showCustom && (
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
          <input
            type="date"
            value={localFrom}
            onChange={(e) => setLocalFrom(e.target.value)}
            className="text-xs border-none outline-none bg-transparent"
          />
          <span className="text-xs text-gray-400">-</span>
          <input
            type="date"
            value={localTo}
            onChange={(e) => setLocalTo(e.target.value)}
            className="text-xs border-none outline-none bg-transparent"
          />
          <button
            onClick={applyCustom}
            className="text-xs px-2 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Aplicar
          </button>
        </div>
      )}

      <span className="text-xs text-gray-400 ml-1">
        {from} a {to}
      </span>
    </div>
  )
}
