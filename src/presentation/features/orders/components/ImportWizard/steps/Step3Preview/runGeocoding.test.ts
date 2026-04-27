import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runGeocoding, type GeocodeOutput } from './runGeocoding';

vi.mock('@/application/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 't' } } }),
    },
  },
}));

vi.stubEnv('VITE_ROUTING_BASE_URL', 'http://routing');

function makeInputs(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `r${i}`, address: `Av ${i}` }));
}

function okResponse(inputs: { id: string; address: string }[]): Response {
  const results: GeocodeOutput[] = inputs.map((i) => ({
    id: i.id,
    lat: -33.4,
    lng: -70.6,
    confidence: 0.8,
  }));
  return {
    ok: true,
    json: async () => ({ results }),
  } as Response;
}

describe('runGeocoding', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('chunkea 500 inputs en 3 chunks de 200/200/100', async () => {
    const fetchMock = vi.fn(async (_url: string, opts: RequestInit) => {
      const body = JSON.parse(opts.body as string) as { addresses: { id: string; address: string }[] };
      return okResponse(body.addresses);
    });
    vi.stubGlobal('fetch', fetchMock);

    const ctrl = new AbortController();
    const r = await runGeocoding({ inputs: makeInputs(500), signal: ctrl.signal });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(r.results.size).toBe(500);
    expect(r.failedIds.size).toBe(0);
    expect(r.cancelled).toBe(false);
  });

  it('IDs sin respuesta del provider quedan en failedIds', async () => {
    const fetchMock = vi.fn(async (_url: string, opts: RequestInit) => {
      const body = JSON.parse(opts.body as string) as { addresses: { id: string }[] };
      // Devuelve solo la mitad
      const half = body.addresses.slice(0, body.addresses.length / 2);
      return okResponse(half.map((h) => ({ id: h.id, address: '' })));
    });
    vi.stubGlobal('fetch', fetchMock);

    const ctrl = new AbortController();
    const r = await runGeocoding({ inputs: makeInputs(20), signal: ctrl.signal });

    expect(r.results.size).toBe(10);
    expect(r.failedIds.size).toBe(10);
  });

  it('un chunk fallido no rompe el resto', async () => {
    let call = 0;
    const fetchMock = vi.fn(async (_url: string, opts: RequestInit) => {
      call++;
      const body = JSON.parse(opts.body as string) as { addresses: { id: string; address: string }[] };
      if (call === 1) {
        // Falla con 400 (non-retryable)
        return { ok: false, status: 400, json: async () => ({ error: 'bad' }) } as Response;
      }
      return okResponse(body.addresses);
    });
    vi.stubGlobal('fetch', fetchMock);

    const ctrl = new AbortController();
    const r = await runGeocoding({ inputs: makeInputs(400), signal: ctrl.signal });

    expect(r.results.size).toBe(200);
    expect(r.failedIds.size).toBe(200);
    expect(r.errors.length).toBe(1);
  });

  it('progress callback se llama por chunk', async () => {
    const fetchMock = vi.fn(async (_url: string, opts: RequestInit) => {
      const body = JSON.parse(opts.body as string) as { addresses: { id: string; address: string }[] };
      return okResponse(body.addresses);
    });
    vi.stubGlobal('fetch', fetchMock);

    const progressCalls: { done: number; total: number }[] = [];
    const ctrl = new AbortController();
    await runGeocoding({
      inputs: makeInputs(450),
      signal: ctrl.signal,
      onProgress: (p) => progressCalls.push(p),
    });

    expect(progressCalls).toHaveLength(3);
    expect(progressCalls[2]).toEqual({ done: 450, total: 450 });
  });
});
