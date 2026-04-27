/**
 * Geocoding chunked con cancellable + retry.
 *
 * - 200 direcciones por chunk (provider rate limit típico).
 * - Secuencial (no paralelo) para no saturar al provider.
 * - AbortController por todo el batch; un cancel detiene los chunks pendientes.
 * - Si un chunk falla los 2 retries, marcamos esas filas como geocoding error
 *   pero continuamos con el resto.
 */
import { GEOCODING_CHUNK_SIZE, GEOCODING_TIMEOUT_MS, RETRY_ATTEMPTS, RETRY_BASE_DELAY_MS } from '../../constants';
import { supabase } from '@/application/lib/supabase';
import type { MatchQuality } from '../../types/import.types';

export interface GeocodeInput {
  id: string;
  address: string;
}

export interface GeocodeOutput {
  id: string;
  lat: number | null;
  lng: number | null;
  confidence: number;
  stopCandidateId?: string | null;
  matchQuality?: MatchQuality;
  candidateAddress?: string | null;
  candidateCustomerName?: string | null;
  candidateUseCount?: number;
}

interface ChunkBatchResponse {
  results?: GeocodeOutput[];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

function isRetryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function postBatch(
  inputs: GeocodeInput[],
  signal: AbortSignal,
): Promise<{ ok: true; data: GeocodeOutput[] } | { ok: false; status: number; error: string }> {
  const ROUTING = import.meta.env.VITE_ROUTING_BASE_URL as string | undefined;
  if (!ROUTING) return { ok: false, status: 0, error: 'VITE_ROUTING_BASE_URL no configurada' };

  const res = await fetch(`${ROUTING}/geocode/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ addresses: inputs }),
    signal,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, status: res.status, error: body.error ?? `HTTP ${res.status}` };
  }
  const data = (await res.json()) as ChunkBatchResponse;
  return { ok: true, data: data.results ?? [] };
}

async function postBatchWithRetry(
  inputs: GeocodeInput[],
  signal: AbortSignal,
): Promise<{ ok: true; data: GeocodeOutput[] } | { ok: false; error: string }> {
  let lastErr = 'desconocido';
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    if (signal.aborted) return { ok: false, error: 'Cancelado' };
    const r = await postBatch(inputs, signal);
    if (r.ok) return r;
    lastErr = r.error;
    if (!isRetryable(r.status)) return { ok: false, error: r.error };
    if (attempt < RETRY_ATTEMPTS - 1) {
      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, delay);
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(t);
            reject(new DOMException('Aborted', 'AbortError'));
          },
          { once: true },
        );
      }).catch(() => {
        return;
      });
    }
  }
  return { ok: false, error: `Falló tras ${RETRY_ATTEMPTS} intentos: ${lastErr}` };
}

export interface RunGeocodingProgress {
  done: number;
  total: number;
}

export interface RunGeocodingArgs {
  inputs: GeocodeInput[];
  signal: AbortSignal;
  onProgress?: (p: RunGeocodingProgress) => void;
}

export interface RunGeocodingResult {
  /** Map id → resultado (solo IDs que el provider respondió OK). */
  results: Map<string, GeocodeOutput>;
  /** IDs que fallaron (chunks que no resolvieron tras retries). */
  failedIds: Set<string>;
  /** Mensajes de chunks que fallaron, para mostrar al user. */
  errors: string[];
  /** True si el caller canceló a media. */
  cancelled: boolean;
}

export async function runGeocoding({ inputs, signal, onProgress }: RunGeocodingArgs): Promise<RunGeocodingResult> {
  const results = new Map<string, GeocodeOutput>();
  const failedIds = new Set<string>();
  const errors: string[] = [];

  if (inputs.length === 0) {
    return { results, failedIds, errors, cancelled: false };
  }

  const chunks = chunk(inputs, GEOCODING_CHUNK_SIZE);
  let done = 0;

  for (const c of chunks) {
    if (signal.aborted) {
      return { results, failedIds, errors, cancelled: true };
    }

    const chunkCtrl = new AbortController();
    const timeoutId = setTimeout(() => chunkCtrl.abort(), GEOCODING_TIMEOUT_MS);
    signal.addEventListener('abort', () => chunkCtrl.abort(), { once: true });

    try {
      const r = await postBatchWithRetry(c, chunkCtrl.signal);
      if (r.ok) {
        for (const out of r.data) {
          results.set(out.id, out);
        }
        // IDs solicitados pero NO devueltos por el provider quedan como fallidos.
        for (const inp of c) {
          if (!results.has(inp.id)) failedIds.add(inp.id);
        }
      } else {
        errors.push(r.error);
        for (const inp of c) failedIds.add(inp.id);
      }
    } finally {
      clearTimeout(timeoutId);
    }

    done += c.length;
    onProgress?.({ done, total: inputs.length });
  }

  return { results, failedIds, errors, cancelled: false };
}
