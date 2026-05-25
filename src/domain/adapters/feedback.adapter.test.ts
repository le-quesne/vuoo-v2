import { describe, it, expect } from 'vitest'
import {
  feedbackFromRow,
  summarizeFeedback,
  rankDrivers,
  weeklyTrend,
} from './feedback.adapter'
import type { DeliveryFeedback } from '@/data/types/database'
import type { DeliveryFeedbackEntity } from '@/domain/entities/feedback'

function row(overrides: Partial<DeliveryFeedback> = {}): DeliveryFeedback {
  return {
    id: overrides.id ?? 'fb-1',
    org_id: 'org-1',
    plan_stop_id: 'ps-1',
    driver_id: overrides.driver_id ?? null,
    rating: overrides.rating ?? 5,
    comment: overrides.comment ?? null,
    submitted_at: overrides.submitted_at ?? '2026-05-20T10:00:00Z',
    ...overrides,
  }
}

function entity(overrides: Partial<DeliveryFeedbackEntity> = {}): DeliveryFeedbackEntity {
  return {
    id: 'fb',
    orgId: 'org-1',
    planStopId: 'ps-1',
    driverId: overrides.driverId ?? 'd-1',
    rating: overrides.rating ?? 5,
    comment: overrides.comment ?? null,
    submittedAt: overrides.submittedAt ?? '2026-05-20T10:00:00Z',
    ...overrides,
  }
}

describe('feedbackFromRow', () => {
  it('maps snake_case row → camelCase entity', () => {
    const e = feedbackFromRow(
      row({ id: 'a', driver_id: 'd-9', rating: 4, comment: 'ok' }),
    )
    expect(e).toEqual({
      id: 'a',
      orgId: 'org-1',
      planStopId: 'ps-1',
      driverId: 'd-9',
      rating: 4,
      comment: 'ok',
      submittedAt: '2026-05-20T10:00:00Z',
    })
  })
})

describe('summarizeFeedback', () => {
  it('returns nulls when there are no responses', () => {
    const s = summarizeFeedback([], 0)
    expect(s.totalResponses).toBe(0)
    expect(s.avgRating).toBeNull()
    expect(s.nps).toBeNull()
    expect(s.responseRatePct).toBeNull()
    expect(s.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 })
  })

  it('computes NPS = (promoters - detractors)/total * 100', () => {
    const fbs = [
      entity({ id: '1', rating: 5 }),
      entity({ id: '2', rating: 5 }),
      entity({ id: '3', rating: 5 }),
      entity({ id: '4', rating: 4 }),
      entity({ id: '5', rating: 3 }),
      entity({ id: '6', rating: 2 }),
      entity({ id: '7', rating: 1 }),
    ]
    const s = summarizeFeedback(fbs, 14)
    // promoters: 3 (5s); detractors: 2 (1+2). NPS = (3-2)/7 = 14.28 → round = 14
    expect(s.nps).toBe(14)
    expect(s.totalResponses).toBe(7)
    expect(s.avgRating).toBeCloseTo(3.6, 1)
    expect(s.responseRatePct).toBe(50)
    expect(s.distribution).toEqual({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 3 })
  })

  it('caps NPS at +100 / -100', () => {
    const allPromoters = Array.from({ length: 5 }, (_, i) =>
      entity({ id: String(i), rating: 5 }),
    )
    expect(summarizeFeedback(allPromoters, 10).nps).toBe(100)

    const allDetractors = Array.from({ length: 5 }, (_, i) =>
      entity({ id: String(i), rating: 1 }),
    )
    expect(summarizeFeedback(allDetractors, 10).nps).toBe(-100)
  })

  it('handles 0 completed stops without dividing by zero', () => {
    const s = summarizeFeedback([entity({ rating: 5 })], 0)
    expect(s.responseRatePct).toBeNull()
  })
})

describe('rankDrivers', () => {
  it('excludes drivers with <3 responses (anti-ruido)', () => {
    const fbs = [
      entity({ id: '1', driverId: 'd-a', rating: 5 }),
      entity({ id: '2', driverId: 'd-a', rating: 5 }),
      // d-a tiene 2 → debe quedar fuera
    ]
    const drivers = [{ id: 'd-a', firstName: 'Ana', lastName: 'Soto' }]
    const { top, bottom } = rankDrivers(fbs, drivers)
    expect(top).toHaveLength(0)
    expect(bottom).toHaveLength(0)
  })

  it('orders top desc / bottom asc by avg rating', () => {
    const fbs = [
      ...Array.from({ length: 3 }, (_, i) =>
        entity({ id: `g-${i}`, driverId: 'd-good', rating: 5 }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        entity({ id: `b-${i}`, driverId: 'd-bad', rating: 2 }),
      ),
    ]
    const drivers = [
      { id: 'd-good', firstName: 'Buen', lastName: 'Driver' },
      { id: 'd-bad', firstName: 'Mal', lastName: 'Driver' },
    ]
    const { top, bottom } = rankDrivers(fbs, drivers)
    expect(top[0].driverId).toBe('d-good')
    expect(top[0].avgRating).toBe(5)
    expect(bottom[0].driverId).toBe('d-bad')
    expect(bottom[0].avgRating).toBe(2)
  })
})

describe('weeklyTrend', () => {
  it('agrupa por lunes ISO', () => {
    // 2026-05-18 es lunes
    const fbs = [
      entity({ id: '1', submittedAt: '2026-05-19T10:00:00Z', rating: 5 }), // semana 05-18
      entity({ id: '2', submittedAt: '2026-05-20T10:00:00Z', rating: 3 }), // semana 05-18
      entity({ id: '3', submittedAt: '2026-05-26T10:00:00Z', rating: 4 }), // semana 05-25
    ]
    const trend = weeklyTrend(fbs)
    expect(trend).toEqual([
      { weekStart: '2026-05-18', avgRating: 4, responses: 2 },
      { weekStart: '2026-05-25', avgRating: 4, responses: 1 },
    ])
  })

  it('returns empty list when no feedback', () => {
    expect(weeklyTrend([])).toEqual([])
  })
})
