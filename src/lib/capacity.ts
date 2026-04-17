import type { Order, PlanStopWithStop } from '../types/database'

export function calculateRouteWeight(
  planStops: PlanStopWithStop[],
  ordersByPlanStop: Map<string, Order>
): number | null {
  let total = 0
  let hasAny = false

  for (const ps of planStops) {
    const order = ordersByPlanStop.get(ps.id)
    if (order && order.total_weight_kg > 0) {
      total += order.total_weight_kg
      hasAny = true
    }
  }

  return hasAny ? total : null
}

export interface CapacityStatus {
  percent: number
  color: 'green' | 'yellow' | 'red'
  label: string
}

export function getCapacityStatus(
  usedKg: number | null,
  capacityKg: number | null
): CapacityStatus | null {
  if (usedKg === null || capacityKg === null || capacityKg === 0) {
    return null
  }

  const percent = Math.round((usedKg / capacityKg) * 100)
  const color: CapacityStatus['color'] =
    percent > 100 ? 'red' : percent >= 80 ? 'yellow' : 'green'

  const usedLabel = formatWeightNumber(usedKg)
  const capacityLabel = formatWeightNumber(capacityKg)

  return {
    percent,
    color,
    label: `${usedLabel}/${capacityLabel} kg (${percent}%)`,
  }
}

export function formatWeight(kg: number): string {
  return `${formatWeightNumber(kg)} kg`
}

function formatWeightNumber(kg: number): string {
  return kg < 10 ? kg.toFixed(1) : Math.round(kg).toString()
}
