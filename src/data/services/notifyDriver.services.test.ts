import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockFrom, mockFunctionsInvoke } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockFunctionsInvoke: vi.fn(),
}))

vi.mock('@/application/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    functions: { invoke: mockFunctionsInvoke },
  },
}))

import {
  notifyDriversOnPublish,
  notifyDriversOnUnpublish,
} from './notifyDriver.services'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds a fluent Supabase query chain that resolves to `result`.
 * Supports .select().eq().not().maybeSingle() chaining patterns.
 */
function makeChain(result: { data?: unknown; error?: { message: string } | null }) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  }
  // Make thenable so `await supabase.from(...).select(...).eq(...)` works
  // without calling .maybeSingle() explicitly (routes query uses .not() at end).
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(result).then(resolve)
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: push function succeeds
  mockFunctionsInvoke.mockResolvedValue({ error: null })
})

// ─── notifyDriversOnPublish ───────────────────────────────────────────────────

describe('notifyDriversOnPublish', () => {
  it('sends a push to each driver with an assigned route', async () => {
    // First call: fetch plan metadata
    mockFrom
      .mockReturnValueOnce(makeChain({ data: { name: 'Plan Alpha', date: '2026-05-14' } }))
      // Second call: fetch routes with driver_id
      .mockReturnValueOnce(
        makeChain({
          data: [
            { id: 'route-1', driver_id: 'driver-1' },
            { id: 'route-2', driver_id: 'driver-2' },
          ],
        }),
      )
      // resolveDriverUserId for driver-1
      .mockReturnValueOnce(makeChain({ data: { user_id: 'user-1' } }))
      // resolveDriverUserId for driver-2
      .mockReturnValueOnce(makeChain({ data: { user_id: 'user-2' } }))

    await notifyDriversOnPublish('plan-x', 'org-1')

    // send-push must be invoked once per driver
    expect(mockFunctionsInvoke).toHaveBeenCalledTimes(2)
    expect(mockFunctionsInvoke).toHaveBeenCalledWith(
      'send-push',
      expect.objectContaining({
        body: expect.objectContaining({
          user_ids: ['user-1'],
          data: expect.objectContaining({ type: 'plan_published', planId: 'plan-x' }),
        }),
      }),
    )
  })

  it('uses fallback title when plan name is absent', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: { name: '', date: null } }))
      .mockReturnValueOnce(makeChain({ data: [{ id: 'r1', driver_id: 'd1' }] }))
      .mockReturnValueOnce(makeChain({ data: { user_id: 'u1' } }))

    await notifyDriversOnPublish('plan-y', 'org-1')

    expect(mockFunctionsInvoke).toHaveBeenCalledWith(
      'send-push',
      expect.objectContaining({
        body: expect.objectContaining({ title: 'Ruta lista para hoy' }),
      }),
    )
  })

  it('does nothing when there are no routes with drivers', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: { name: 'Plan Sin Choferes', date: '2026-05-14' } }))
      .mockReturnValueOnce(makeChain({ data: [] }))

    await notifyDriversOnPublish('plan-z', 'org-1')

    expect(mockFunctionsInvoke).not.toHaveBeenCalled()
  })

  it('skips a driver when resolveDriverUserId returns null (no user_id)', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: { name: 'Plan Omega', date: '2026-05-14' } }))
      .mockReturnValueOnce(makeChain({ data: [{ id: 'r1', driver_id: 'd-no-user' }] }))
      // driver has no linked user
      .mockReturnValueOnce(makeChain({ data: { user_id: null } }))

    await notifyDriversOnPublish('plan-omega', 'org-1')

    expect(mockFunctionsInvoke).not.toHaveBeenCalled()
  })

  it('does not throw when the outer supabase call errors (swallows gracefully)', async () => {
    // Simulate a total DB failure on the plan fetch
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockRejectedValue(new Error('network failure')),
      then: (_: unknown, reject: (e: Error) => void) =>
        Promise.reject(new Error('network failure')).catch(reject),
    })

    // Should resolve without throwing
    await expect(notifyDriversOnPublish('plan-err')).resolves.toBeUndefined()
  })
})

// ─── notifyDriversOnUnpublish ─────────────────────────────────────────────────

describe('notifyDriversOnUnpublish', () => {
  it('sends a "ruta modificada" push to each driver', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: { name: 'Plan Beta', date: '2026-05-15' } }))
      .mockReturnValueOnce(
        makeChain({ data: [{ id: 'route-A', driver_id: 'drv-A' }] }),
      )
      .mockReturnValueOnce(makeChain({ data: { user_id: 'uid-A' } }))

    await notifyDriversOnUnpublish('plan-b', 'org-1')

    expect(mockFunctionsInvoke).toHaveBeenCalledTimes(1)
    expect(mockFunctionsInvoke).toHaveBeenCalledWith(
      'send-push',
      expect.objectContaining({
        body: expect.objectContaining({
          user_ids: ['uid-A'],
          title: 'Ruta modificada: Plan Beta',
          body: 'Tu ruta fue pausada. Espera instrucciones del despachador.',
          data: expect.objectContaining({ type: 'plan_unpublished', planId: 'plan-b' }),
        }),
      }),
    )
  })

  it('uses fallback title when plan name is blank', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: { name: '   ', date: null } }))
      .mockReturnValueOnce(makeChain({ data: [{ id: 'rA', driver_id: 'dA' }] }))
      .mockReturnValueOnce(makeChain({ data: { user_id: 'uA' } }))

    await notifyDriversOnUnpublish('plan-blank')

    expect(mockFunctionsInvoke).toHaveBeenCalledWith(
      'send-push',
      expect.objectContaining({
        body: expect.objectContaining({ title: 'Ruta modificada' }),
      }),
    )
  })

  it('does nothing when there are no routes with drivers', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: { name: 'Plan Delta', date: '2026-05-15' } }))
      .mockReturnValueOnce(makeChain({ data: null }))

    await notifyDriversOnUnpublish('plan-delta')

    expect(mockFunctionsInvoke).not.toHaveBeenCalled()
  })

  it('skips drivers whose user_id cannot be resolved', async () => {
    mockFrom
      .mockReturnValueOnce(makeChain({ data: { name: 'Plan Gamma', date: '2026-05-15' } }))
      .mockReturnValueOnce(makeChain({ data: [{ id: 'rG', driver_id: 'dG' }] }))
      .mockReturnValueOnce(makeChain({ data: null })) // driver not found

    await notifyDriversOnUnpublish('plan-gamma')

    expect(mockFunctionsInvoke).not.toHaveBeenCalled()
  })

  it('does not throw on outer DB failure (swallows gracefully)', async () => {
    mockFrom.mockImplementationOnce(() => {
      throw new Error('db unavailable')
    })

    await expect(notifyDriversOnUnpublish('plan-fail')).resolves.toBeUndefined()
  })
})
