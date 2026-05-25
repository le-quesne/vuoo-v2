import type { Order, PlanStopWithStop } from '@/data/types/database'

/**
 * Agrega el peso REAL por plan_stop. Un mismo destino puede tener varias
 * órdenes consolidadas (38 órdenes → 30 paradas físicas, por ejemplo), y el
 * camión carga la suma. No usar un `Map<string, Order>` que se sobreescribe
 * por plan_stop_id: pierde paquetes y subestima la carga (lo que ve Vroom y
 * el backend ≠ lo que muestra la UI).
 */
export function buildWeightByPlanStop(orders: Order[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const o of orders) {
    if (!o.plan_stop_id) continue
    if (!(o.total_weight_kg > 0)) continue
    map.set(o.plan_stop_id, (map.get(o.plan_stop_id) ?? 0) + o.total_weight_kg)
  }
  return map
}

/** Cuenta órdenes por plan_stop. Útil para mostrar "N órdenes" en consolidados. */
export function buildOrdersCountByPlanStop(orders: Order[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const o of orders) {
    if (!o.plan_stop_id) continue
    map.set(o.plan_stop_id, (map.get(o.plan_stop_id) ?? 0) + 1)
  }
  return map
}

export function calculateRouteWeight(
  planStops: PlanStopWithStop[],
  weightByPlanStop: Map<string, number>
): number | null {
  let total = 0
  let hasAny = false

  for (const ps of planStops) {
    // Paradas completadas/canceladas ya no van en el camión: no consumen capacidad.
    if (ps.status === 'completed' || ps.status === 'cancelled') continue

    const kg = weightByPlanStop.get(ps.id) ?? 0
    if (kg > 0) {
      total += kg
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
