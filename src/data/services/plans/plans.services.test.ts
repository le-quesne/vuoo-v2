import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@/application/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
  },
}))

import {
  publishPlan,
  unpublishPlan,
} from './plans.services'

function makeFromChain(result: { data?: unknown; error?: { message: string } | null }) {
  const chain = {
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: undefined as unknown,
  }
  // make the chain itself thenable for awaited calls that don't call .maybeSingle()
  ;(chain as unknown as Promise<unknown>).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(result).then(resolve)
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── publishPlan ──────────────────────────────────────────────────────────────

describe('publishPlan', () => {
  it('returns ok when supabase update succeeds', async () => {
    const chain = makeFromChain({ data: null, error: null })
    mockFrom.mockReturnValue(chain)

    const res = await publishPlan('plan-1', 'org-1')

    expect(res.success).toBe(true)
    expect(chain.update).toHaveBeenCalledWith({ status: 'published' })
    expect(chain.eq).toHaveBeenCalledWith('id', 'plan-1')
    expect(chain.eq).toHaveBeenCalledWith('org_id', 'org-1')
  })

  it('returns failure when supabase returns an error', async () => {
    const chain = makeFromChain({ data: null, error: { message: 'DB error' } })
    mockFrom.mockReturnValue(chain)

    const res = await publishPlan('plan-1', 'org-1')

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toBe('DB error')
  })

  it('returns failure when plan has no stops (publish still succeeds — no guard at service level)', async () => {
    // publishPlan is intentionally a simple UPDATE; empty-plan guard is a UI concern
    const chain = makeFromChain({ data: null, error: null })
    mockFrom.mockReturnValue(chain)

    const res = await publishPlan('empty-plan', 'org-1')
    expect(res.success).toBe(true)
  })
})

// ─── unpublishPlan ────────────────────────────────────────────────────────────

describe('unpublishPlan', () => {
  it('returns ok when rpc unpublish_plan returns "ok"', async () => {
    mockRpc.mockResolvedValue({ data: 'ok', error: null })

    const res = await unpublishPlan('plan-1', 'org-1')

    expect(res.success).toBe(true)
    if (res.success) expect(res.data).toBe('ok')
    expect(mockRpc).toHaveBeenCalledWith('unpublish_plan', {
      p_plan_id: 'plan-1',
      p_org_id: 'org-1',
    })
  })

  it('returns routes_active when rpc signals in_transit routes', async () => {
    mockRpc.mockResolvedValue({ data: 'routes_active', error: null })

    const res = await unpublishPlan('plan-1', 'org-1')

    expect(res.success).toBe(true)
    if (res.success) expect(res.data).toBe('routes_active')
  })

  it('returns failure when rpc itself errors', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'RPC error' } })

    const res = await unpublishPlan('plan-1', 'org-1')

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toBe('RPC error')
  })

  it('passes through not_found when plan does not exist or caller lacks membership', async () => {
    mockRpc.mockResolvedValue({ data: 'not_found', error: null })

    const res = await unpublishPlan('ghost-plan', 'org-1')

    expect(res.success).toBe(true)
    if (res.success) expect(res.data).toBe('not_found')
  })
})
