export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value == null || Number.isNaN(value)) return '-'
  return new Intl.NumberFormat('es-CL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatDistance(km: number | null | undefined): string {
  if (km == null || Number.isNaN(km)) return '-'
  return `${formatNumber(km, km >= 100 ? 0 : 1)} km`
}

export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(minutes)) return '-'
  const total = Math.round(minutes)
  if (total < 60) return `${total}m`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '-'
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(Math.round(amount))
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value == null || Number.isNaN(value)) return '-'
  return `${value.toFixed(decimals)}%`
}

export interface Delta {
  value: number
  percent: number | null
  direction: 'up' | 'down' | 'flat'
}

export function calculateDelta(current: number | null | undefined, previous: number | null | undefined): Delta {
  const curr = current ?? 0
  const prev = previous ?? 0
  const diff = curr - prev
  let percent: number | null = null
  if (prev !== 0) percent = (diff / Math.abs(prev)) * 100
  else if (curr !== 0) percent = null
  const direction: Delta['direction'] = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'
  return { value: diff, percent, direction }
}
