// Coverage for notification retry backoff. Espejado por la copia inline
// en supabase/functions/send-notification/index.ts — si cambia el schedule
// allá, cambiar también acá y mantener este test verde.
import { describe, it, expect } from 'vitest'
import {
  computeNextRetryAt,
  shouldRetry,
  MAX_NOTIFICATION_ATTEMPTS,
} from './notificationRetry'

describe('computeNextRetryAt', () => {
  const NOW = new Date('2026-05-22T10:00:00.000Z')

  it('schedules retry #1 at +1 min after the first failure (attempts=1)', () => {
    const next = computeNextRetryAt(1, NOW)
    expect(next).toBe('2026-05-22T10:01:00.000Z')
  })

  it('schedules retry #2 at +5 min after attempts=2', () => {
    const next = computeNextRetryAt(2, NOW)
    expect(next).toBe('2026-05-22T10:05:00.000Z')
  })

  it('returns null after MAX_NOTIFICATION_ATTEMPTS attempts', () => {
    expect(computeNextRetryAt(MAX_NOTIFICATION_ATTEMPTS, NOW)).toBeNull()
    expect(computeNextRetryAt(4, NOW)).toBeNull()
    expect(computeNextRetryAt(99, NOW)).toBeNull()
  })

  it('uses the provided "from" date as the anchor', () => {
    const t = new Date('2030-01-01T00:00:00.000Z')
    expect(computeNextRetryAt(1, t)).toBe('2030-01-01T00:01:00.000Z')
  })

  it('defaults to "now" when from is omitted', () => {
    const before = Date.now()
    const result = computeNextRetryAt(1)
    const after = Date.now()
    const resultMs = new Date(result as string).getTime()
    expect(resultMs).toBeGreaterThanOrEqual(before + 60_000 - 5)
    expect(resultMs).toBeLessThanOrEqual(after + 60_000 + 5)
  })
})

describe('shouldRetry', () => {
  it('returns true until MAX_NOTIFICATION_ATTEMPTS', () => {
    expect(shouldRetry(0)).toBe(true)
    expect(shouldRetry(1)).toBe(true)
    expect(shouldRetry(MAX_NOTIFICATION_ATTEMPTS - 1)).toBe(true)
  })

  it('returns false once max is reached', () => {
    expect(shouldRetry(MAX_NOTIFICATION_ATTEMPTS)).toBe(false)
    expect(shouldRetry(MAX_NOTIFICATION_ATTEMPTS + 5)).toBe(false)
  })
})
