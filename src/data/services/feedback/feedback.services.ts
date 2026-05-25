import { supabase } from '@/application/lib/supabase'
import { ok, fail, toErrorMessage, type ServiceResult } from '@/data/services/_shared/response'
import {
  feedbackFromRow,
  summarizeFeedback,
  rankDrivers,
  weeklyTrend,
  type DriverInfo,
} from '@/domain/adapters/feedback.adapter'
import type {
  DeliveryFeedbackEntity,
  FeedbackOrgSummary,
  FeedbackDriverRank,
  FeedbackWeeklyPoint,
  NegativeFeedback,
} from '@/domain/entities/feedback'
import type { DeliveryFeedbackWithContext } from './feedback.types'

export interface FeedbackDateRange {
  from: string
  to: string
}

export interface FeedbackNPSSummary {
  summary: FeedbackOrgSummary
  topDrivers: FeedbackDriverRank[]
  bottomDrivers: FeedbackDriverRank[]
  trend: FeedbackWeeklyPoint[]
  negativeComments: NegativeFeedback[]
}

const FEEDBACK_SELECT = `
  id, org_id, plan_stop_id, driver_id, rating, comment, submitted_at,
  driver:drivers(id, first_name, last_name),
  plan_stop:plan_stops(id, stop:stops(customer_name, name, address))
`

export async function listForOrg(
  orgId: string,
  range: FeedbackDateRange,
): Promise<ServiceResult<DeliveryFeedbackEntity[]>> {
  try {
    const { data, error } = await supabase
      .from('delivery_feedback')
      .select(FEEDBACK_SELECT)
      .eq('org_id', orgId)
      .gte('submitted_at', range.from)
      .lte('submitted_at', `${range.to}T23:59:59`)
      .order('submitted_at', { ascending: false })

    if (error) return fail(error.message)
    const rows = (data ?? []) as unknown as DeliveryFeedbackWithContext[]
    return ok(rows.map(feedbackFromRow))
  } catch (e) {
    return fail(toErrorMessage(e))
  }
}

// Carga feedback + ranking + trend + negativos en un solo request.
// Hidrata todo lo que el NPSDashboard necesita.
export async function summaryForOrg(
  orgId: string,
  range: FeedbackDateRange,
  completedStops: number,
): Promise<ServiceResult<FeedbackNPSSummary>> {
  try {
    const [feedbackRes, driversRes] = await Promise.all([
      supabase
        .from('delivery_feedback')
        .select(FEEDBACK_SELECT)
        .eq('org_id', orgId)
        .gte('submitted_at', range.from)
        .lte('submitted_at', `${range.to}T23:59:59`)
        .order('submitted_at', { ascending: false }),
      supabase
        .from('drivers')
        .select('id, first_name, last_name')
        .eq('org_id', orgId),
    ])

    if (feedbackRes.error) return fail(feedbackRes.error.message)
    if (driversRes.error) return fail(driversRes.error.message)

    const rows = (feedbackRes.data ?? []) as unknown as DeliveryFeedbackWithContext[]
    type DriverRow = { id: string; first_name: string | null; last_name: string | null }
    const drivers: DriverInfo[] = ((driversRes.data ?? []) as DriverRow[]).map((d) => ({
      id: d.id,
      firstName: d.first_name ?? '',
      lastName: d.last_name ?? '',
    }))

    const entities = rows.map(feedbackFromRow)
    const summary = summarizeFeedback(entities, completedStops)
    const ranking = rankDrivers(entities, drivers)
    const trend = weeklyTrend(entities)

    const driverNameMap = new Map(
      drivers.map((d) => [d.id, `${d.firstName} ${d.lastName}`.trim()]),
    )

    const negativeComments: NegativeFeedback[] = rows
      .filter((r) => r.rating <= 2 && r.comment && r.comment.trim().length > 0)
      .slice(0, 20)
      .map((r) => ({
        feedback: feedbackFromRow(r),
        customerName: r.plan_stop?.stop?.customer_name ?? r.plan_stop?.stop?.name ?? null,
        stopAddress: r.plan_stop?.stop?.address ?? null,
        driverName: r.driver_id ? (driverNameMap.get(r.driver_id) ?? null) : null,
      }))

    return ok({
      summary,
      topDrivers: ranking.top,
      bottomDrivers: ranking.bottom,
      trend,
      negativeComments,
    })
  } catch (e) {
    return fail(toErrorMessage(e))
  }
}
