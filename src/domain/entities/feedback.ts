// Entidad de dominio: feedback de entrega.
//
// La UI consume `DeliveryFeedbackEntity` (este tipo), nunca la row cruda
// de Supabase. El adapter en src/domain/adapters/feedback.adapter.ts mapea
// del row a este shape.

export interface DeliveryFeedbackEntity {
  id: string
  orgId: string
  planStopId: string
  driverId: string | null
  rating: number
  comment: string | null
  submittedAt: string
}

// Resúmenes agregados para el NPS dashboard.

export interface FeedbackOrgSummary {
  totalResponses: number
  avgRating: number | null
  // NPS Net-Promoter-style: promoters (5) - detractors (≤2), en % de respuestas.
  nps: number | null
  distribution: Record<1 | 2 | 3 | 4 | 5, number>
  responseRatePct: number | null
}

export interface FeedbackDriverRank {
  driverId: string
  driverName: string
  totalResponses: number
  avgRating: number
}

export interface FeedbackWeeklyPoint {
  weekStart: string
  avgRating: number
  responses: number
}

export interface NegativeFeedback {
  feedback: DeliveryFeedbackEntity
  customerName: string | null
  stopAddress: string | null
  driverName: string | null
}
