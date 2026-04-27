import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useImportSubmit } from './useImportSubmit';
import type { ImportRow } from '@/data/services/orders/orders.services';

vi.mock('@/application/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'tok' } },
      }),
    },
  },
}));

const ROUTING_BASE = 'http://test-routing';
vi.stubEnv('VITE_ROUTING_BASE_URL', ROUTING_BASE);

function makeRow(i: number): ImportRow {
  return {
    customer_name: `Cliente ${i}`,
    address: `Av. ${i}`,
    customer_phone: null,
    customer_email: null,
    lat: null,
    lng: null,
  };
}

function chunkResponse(created: number) {
  return {
    created,
    failed: 0,
    warnings: [],
    orderIds: Array.from({ length: created }, (_, i) => `order-${i}`),
    matchStats: { high: 0, medium: 0, low: 0, none: 0, created },
  };
}

describe('useImportSubmit', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('chunkea 1200 filas en 3 chunks de 500/500/200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => chunkResponse(500),
    });
    vi.stubGlobal('fetch', fetchMock);

    const rows = Array.from({ length: 1200 }, (_, i) => makeRow(i));
    const { result } = renderHook(() => useImportSubmit());

    let report: unknown;
    await act(async () => {
      report = await result.current.submit(rows, null);
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(report).toBeTruthy();
  });

  it('agrega Idempotency-Key distinto por chunk', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => chunkResponse(500),
    });
    vi.stubGlobal('fetch', fetchMock);
    const rows = Array.from({ length: 1000 }, (_, i) => makeRow(i));

    const { result } = renderHook(() => useImportSubmit());
    await act(async () => {
      await result.current.submit(rows, null);
    });

    const headers1 = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    const headers2 = fetchMock.mock.calls[1][1].headers as Record<string, string>;
    expect(headers1['Idempotency-Key']).toBeTruthy();
    expect(headers2['Idempotency-Key']).toBeTruthy();
    expect(headers1['Idempotency-Key']).not.toBe(headers2['Idempotency-Key']);
  });

  it('retry transient 502 hasta 3 veces', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => chunkResponse(2) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useImportSubmit());
    let report: unknown;
    await act(async () => {
      const promise = result.current.submit([makeRow(1), makeRow(2)], null);
      await vi.advanceTimersByTimeAsync(20_000);
      report = await promise;
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(report).toBeTruthy();
  });

  it('NO retry para 400 invalid_body (non-retryable)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_body' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useImportSubmit());
    await act(async () => {
      await result.current.submit([makeRow(1)], null);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toContain('invalid_body');
  });

  it('cancel aborta el submit en curso', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, opts: RequestInit) => {
        const signal = opts.signal;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        });
      }),
    );

    const { result } = renderHook(() => useImportSubmit());
    let submitPromise: Promise<unknown> = Promise.resolve();
    act(() => {
      submitPromise = result.current.submit([makeRow(1)], null);
    });

    await waitFor(() => expect(result.current.isSubmitting).toBe(true));

    act(() => {
      result.current.cancel();
    });

    await act(async () => {
      await submitPromise;
    });

    expect(result.current.error).toMatch(/cancel/i);
  });

  it('progress alcanza 100% tras todos los chunks', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => chunkResponse(500),
    });
    vi.stubGlobal('fetch', fetchMock);
    const rows = Array.from({ length: 1500 }, (_, i) => makeRow(i));

    const { result } = renderHook(() => useImportSubmit());
    await act(async () => {
      await result.current.submit(rows, null);
    });

    expect(result.current.progress).toBe(100);
  });
});
