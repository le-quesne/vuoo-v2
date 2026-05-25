import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  format,
  parseISO,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  subDays,
  subMonths,
  differenceInCalendarDays,
  isValid,
} from 'date-fns'

export type DatePreset = 'today' | 'week' | 'month' | 'last_month' | 'custom'

const DATE_FMT = 'yyyy-MM-dd'

function fmt(d: Date): string {
  return format(d, DATE_FMT)
}

function parse(s: string | null): Date | null {
  if (!s) return null
  const d = parseISO(s)
  return isValid(d) ? d : null
}

function rangeForPreset(preset: DatePreset, today: Date): { from: string; to: string } | null {
  switch (preset) {
    case 'today':
      return { from: fmt(today), to: fmt(today) }
    case 'week': {
      const start = startOfWeek(today, { weekStartsOn: 1 })
      return { from: fmt(start), to: fmt(today) }
    }
    case 'month': {
      const start = startOfMonth(today)
      return { from: fmt(start), to: fmt(today) }
    }
    case 'last_month': {
      const prev = subMonths(today, 1)
      return { from: fmt(startOfMonth(prev)), to: fmt(endOfMonth(prev)) }
    }
    case 'custom':
    default:
      return null
  }
}

function detectPreset(from: string, to: string, today: Date): DatePreset {
  const candidates: DatePreset[] = ['today', 'week', 'month', 'last_month']
  for (const p of candidates) {
    const r = rangeForPreset(p, today)
    if (r && r.from === from && r.to === to) return p
  }
  return 'custom'
}

export function useAnalyticsFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const { from, to, preset } = useMemo(() => {
    const qFrom = searchParams.get('from')
    const qTo = searchParams.get('to')
    const parsedFrom = parse(qFrom)
    const parsedTo = parse(qTo)

    if (parsedFrom && parsedTo) {
      const f = fmt(parsedFrom)
      const t = fmt(parsedTo)
      return { from: f, to: t, preset: detectPreset(f, t, today) }
    }

    const def = rangeForPreset('month', today)!
    return { from: def.from, to: def.to, preset: 'month' as DatePreset }
  }, [searchParams, today])

  const { previousFrom, previousTo } = useMemo(() => {
    const f = parseISO(from)
    const t = parseISO(to)
    const days = differenceInCalendarDays(t, f) + 1
    const prevTo = subDays(f, 1)
    const prevFrom = subDays(prevTo, days - 1)
    return { previousFrom: fmt(prevFrom), previousTo: fmt(prevTo) }
  }, [from, to])

  const setRange = useCallback(
    (newFrom: string, newTo: string) => {
      const next = new URLSearchParams(searchParams)
      next.set('from', newFrom)
      next.set('to', newTo)
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  // Si el rango persistido en la URL matchea un preset (week/month/today/...)
  // pero el cómputo de ese preset con `today` actual da otro rango, el usuario
  // está viendo datos viejos: dejó la pestaña abierta o volvió desde un link
  // antiguo y la app sigue mostrando "Esta semana" con el rango de la semana
  // pasada. Re-calculamos para que "Esta semana" siempre signifique la actual.
  // Custom se respeta — ahí el rango lo eligió el usuario explícitamente.
  useEffect(() => {
    if (preset === 'custom') return
    const fresh = rangeForPreset(preset, today)
    if (!fresh) return
    if (fresh.from !== from || fresh.to !== to) {
      setRange(fresh.from, fresh.to)
    }
  }, [preset, from, to, today, setRange])

  const setPreset = useCallback(
    (p: DatePreset) => {
      if (p === 'custom') {
        const next = new URLSearchParams(searchParams)
        next.set('from', from)
        next.set('to', to)
        setSearchParams(next, { replace: true })
        return
      }
      const r = rangeForPreset(p, today)
      if (!r) return
      setRange(r.from, r.to)
    },
    [searchParams, setSearchParams, from, to, today, setRange],
  )

  return {
    from,
    to,
    preset,
    previousFrom,
    previousTo,
    setRange,
    setPreset,
  }
}
