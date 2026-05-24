import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

export interface SelectOption<T extends string> {
  value: T
  label: string
  count?: number
}

interface SelectProps<T extends string> {
  value: T
  options: SelectOption<T>[]
  onChange: (value: T) => void
  prefix?: string
  className?: string
  title?: string
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  prefix,
  className,
  title,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = options.find((o) => o.value === value) ?? options[0]

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={title}
        className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-[10rem]"
      >
        <span className="flex-1 text-left truncate">
          {prefix && <span className="text-gray-400">{prefix} </span>}
          <span>{current?.label}</span>
          {current?.count !== undefined && (
            <span className="text-gray-400 tabular-nums"> ({current.count})</span>
          )}
        </span>
        <ChevronDown
          size={14}
          className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 min-w-full w-max rounded-lg border border-gray-200 bg-white shadow-lg py-1">
          {options.map((opt) => {
            const active = opt.value === value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
                className={`flex items-center gap-2 w-full px-3 py-1.5 text-left text-sm transition-colors ${
                  active ? 'text-blue-600 bg-blue-50' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Check size={14} className={active ? 'opacity-100' : 'opacity-0'} />
                <span className="flex-1 whitespace-nowrap">{opt.label}</span>
                {opt.count !== undefined && (
                  <span className="text-xs text-gray-400 tabular-nums">{opt.count}</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
