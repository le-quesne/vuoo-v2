import type { DeliveryFeedback } from '@/data/types/database'
import type {
  DeliveryFeedbackEntity,
  FeedbackOrgSummary,
  FeedbackDriverRank,
  FeedbackWeeklyPoint,
} from '@/domain/entities/feedback'

export function feedbackFromRow(row: DeliveryFeedback): DeliveryFeedbackEntity {
  return {
    id: row.id,
    orgId: row.org_id,
    planStopId: row.plan_stop_id,
    driverId: row.driver_id,
    rating: row.rating,
    comment: row.comment,
    submittedAt: row.submitted_at,
  }
}

// Calcula NPS sobre 1-5: promoters (5) - detractors (≤2), como % del total.
// Devuelve null si no hay respuestas.
//
// Por qué este shape:
//   - El PRD pide "rating mean × 20 → 0–100, o 1–5 directo, decidir".
//   - Elegimos NPS clásico porque es la métrica que mide adopción/lealtad,
//     mientras que avg_rating mide satisfacción promedio.
//   - Mantenemos ambos: nps + avgRating en el resumen.
export function summarizeFeedback(
  feedbacks: DeliveryFeedbackEntity[],
  completedStops: number,
): FeedbackOrgSummary {
  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let sum = 0
  for (const f of feedbacks) {
    const r = clampRating(f.rating)
    distribution[r] += 1
    sum += r
  }

  const total = feedbacks.length
  if (total === 0) {
    return {
      totalResponses: 0,
      avgRating: null,
      nps: null,
      distribution,
      responseRatePct: completedStops > 0 ? 0 : null,
    }
  }

  const promoters = distribution[5]
  const detractors = distribution[1] + distribution[2]
  const nps = Math.round(((promoters - detractors) / total) * 100)

  return {
    totalResponses: total,
    avgRating: Math.round((sum / total) * 10) / 10,
    nps,
    distribution,
    responseRatePct: completedStops > 0
      ? Math.round((total / completedStops) * 1000) / 10
      : null,
  }
}

export interface DriverInfo {
  id: string
  firstName: string
  lastName: string
}

export function rankDrivers(
  feedbacks: DeliveryFeedbackEntity[],
  drivers: DriverInfo[],
): { top: FeedbackDriverRank[]; bottom: FeedbackDriverRank[] } {
  const byDriver = new Map<string, { sum: number; count: number }>()

  for (const f of feedbacks) {
    if (!f.driverId) continue
    const cur = byDriver.get(f.driverId) ?? { sum: 0, count: 0 }
    cur.sum += clampRating(f.rating)
    cur.count += 1
    byDriver.set(f.driverId, cur)
  }

  const driverNameMap = new Map(drivers.map((d) => [d.id, `${d.firstName} ${d.lastName}`.trim()]))

  // Solo rankear choferes con al menos 3 respuestas para evitar ruido.
  const ranked: FeedbackDriverRank[] = []
  for (const [driverId, agg] of byDriver) {
    if (agg.count < 3) continue
    ranked.push({
      driverId,
      driverName: driverNameMap.get(driverId) ?? 'Conductor',
      totalResponses: agg.count,
      avgRating: Math.round((agg.sum / agg.count) * 10) / 10,
    })
  }

  const byRatingDesc = [...ranked].sort((a, b) => b.avgRating - a.avgRating || b.totalResponses - a.totalResponses)
  const byRatingAsc = [...ranked].sort((a, b) => a.avgRating - b.avgRating || b.totalResponses - a.totalResponses)

  return {
    top: byRatingDesc.slice(0, 5),
    bottom: byRatingAsc.slice(0, 5),
  }
}

export function weeklyTrend(feedbacks: DeliveryFeedbackEntity[]): FeedbackWeeklyPoint[] {
  if (feedbacks.length === 0) return []

  const byWeek = new Map<string, { sum: number; count: number }>()
  for (const f of feedbacks) {
    const week = weekStartIso(new Date(f.submittedAt))
    const cur = byWeek.get(week) ?? { sum: 0, count: 0 }
    cur.sum += clampRating(f.rating)
    cur.count += 1
    byWeek.set(week, cur)
  }

  return [...byWeek.entries()]
    .map(([weekStart, agg]) => ({
      weekStart,
      avgRating: Math.round((agg.sum / agg.count) * 10) / 10,
      responses: agg.count,
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
}

// --- internals ---

function clampRating(r: number): 1 | 2 | 3 | 4 | 5 {
  if (r <= 1) return 1
  if (r >= 5) return 5
  return Math.round(r) as 1 | 2 | 3 | 4 | 5
}

// Lunes 00:00 UTC de la semana de `date`.
function weekStartIso(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() // 0=Dom .. 6=Sab
  const diff = (day + 6) % 7  // shift a "días desde lunes"
  d.setUTCDate(d.getUTCDate() - diff)
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}
