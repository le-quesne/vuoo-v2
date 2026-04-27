/**
 * useImportSubmit — orquesta el envío chunked al endpoint /orders/import.
 *
 * Decisiones (ver CEO + Eng review 2026-04-26/27):
 * - Chunking 500/chunk. Backend cap es 2K por request.
 * - AbortController: cancela request si user cierra wizard o desmonta el componente.
 * - Idempotency-Key por chunk (UUID v4): forward-compatible. Backend hoy NO lo
 *   respeta (TODO P1), pero el cliente lo manda igual para que cuando aterrice
 *   el fix transaccional, retries no dupliquen.
 * - Retry 3x con backoff exponencial 2s/4s/8s para HTTP 5xx transients.
 * - Timeout 5min por chunk. Cubre cold start Railway + procesamiento.
 * - Progress real: % basado en chunks completados, no fake 0→100.
 *
 * Si un chunk falla los 3 reintentos, el submit completo falla y se reportan
 * los chunks ya creados como `created_so_far`. La UI muestra "X creadas, Y pendientes".
 */
import { useCallback, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '@/application/lib/supabase';
import type { ImportReport } from '../types/import.types';
import type { ImportRow } from '@/data/services/orders/orders.services';
import {
  IMPORT_CHUNK_SIZE,
  IMPORT_TIMEOUT_MS,
  RETRY_ATTEMPTS,
  RETRY_BASE_DELAY_MS,
} from '../constants';

function routingBase(): string | undefined {
  return import.meta.env.VITE_ROUTING_BASE_URL as string | undefined;
}

interface ChunkResponse {
  created: number;
  failed: number;
  warnings: string[];
  orderIds: string[];
  matchStats: {
    high: number;
    medium: number;
    low: number;
    none: number;
    created: number;
  };
}

export interface UseImportSubmitReturn {
  submit: (rows: ImportRow[], templateId: string | null) => Promise<ImportReport | null>;
  cancel: () => void;
  progress: number;
  isSubmitting: boolean;
  error: string | null;
  report: ImportReport | null;
  reset: () => void;
}

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

async function postChunk(args: {
  rows: ImportRow[];
  templateId: string | null;
  signal: AbortSignal;
  idempotencyKey: string;
}): Promise<{ ok: true; data: ChunkResponse } | { ok: false; status: number; error: string }> {
  const headers = await authHeaders();
  const res = await fetch(`${routingBase()}/orders/import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': args.idempotencyKey,
      ...headers,
    },
    body: JSON.stringify({ templateId: args.templateId, rows: args.rows }),
    signal: args.signal,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: unknown };
    const detail = body.detail ? ` (${JSON.stringify(body.detail).slice(0, 200)})` : '';
    return {
      ok: false,
      status: res.status,
      error: (body.error ?? `HTTP ${res.status}`) + detail,
    };
  }
  return { ok: true, data: (await res.json()) as ChunkResponse };
}

async function postChunkWithRetry(args: {
  rows: ImportRow[];
  templateId: string | null;
  signal: AbortSignal;
  idempotencyKey: string;
}): Promise<{ ok: true; data: ChunkResponse } | { ok: false; error: string }> {
  let lastErr = 'desconocido';
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    if (args.signal.aborted) return { ok: false, error: 'Cancelado por el usuario' };
    const r = await postChunk(args);
    if (r.ok) return r;
    lastErr = r.error;
    if (!isRetryableStatus(r.status)) return { ok: false, error: r.error };
    if (attempt < RETRY_ATTEMPTS - 1) {
      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, delay);
        args.signal.addEventListener(
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

export function useImportSubmit(): UseImportSubmitReturn {
  const [progress, setProgress] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setProgress(0);
    setIsSubmitting(false);
    setError(null);
    setReport(null);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const submit = useCallback(
    async (rows: ImportRow[], templateId: string | null): Promise<ImportReport | null> => {
      if (!routingBase()) {
        setError('VITE_ROUTING_BASE_URL no configurada');
        return null;
      }
      if (rows.length === 0) {
        setError('No hay filas para importar');
        return null;
      }

      setIsSubmitting(true);
      setError(null);
      setProgress(0);
      setReport(null);

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const timeoutId = setTimeout(() => ctrl.abort(), IMPORT_TIMEOUT_MS);

      try {
        const chunks = chunk(rows, IMPORT_CHUNK_SIZE);
        const aggregated: ImportReport = {
          created: 0,
          failed: 0,
          warnings: [],
          orderIds: [],
          matchStats: { high: 0, medium: 0, low: 0, none: 0, created: 0 },
        };

        for (let i = 0; i < chunks.length; i++) {
          if (ctrl.signal.aborted) {
            setError('Importación cancelada');
            return null;
          }

          const r = await postChunkWithRetry({
            rows: chunks[i],
            templateId,
            signal: ctrl.signal,
            idempotencyKey: uuidv4(),
          });

          if (!r.ok) {
            const partialMsg =
              aggregated.created > 0
                ? `${r.error}. ${aggregated.created} pedidos ya creados; ${rows.length - aggregated.created - aggregated.failed} pendientes.`
                : r.error;
            setError(partialMsg);
            if (aggregated.created > 0) {
              setReport(aggregated);
            }
            return null;
          }

          aggregated.created += r.data.created;
          aggregated.failed += r.data.failed;
          aggregated.warnings.push(...r.data.warnings);
          aggregated.orderIds.push(...r.data.orderIds);
          aggregated.matchStats.high += r.data.matchStats.high;
          aggregated.matchStats.medium += r.data.matchStats.medium;
          aggregated.matchStats.low += r.data.matchStats.low;
          aggregated.matchStats.none += r.data.matchStats.none;
          aggregated.matchStats.created += r.data.matchStats.created;

          setProgress(Math.round(((i + 1) / chunks.length) * 100));
        }

        setReport(aggregated);
        return aggregated;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          setError('Importación cancelada');
        } else {
          setError(e instanceof Error ? e.message : 'Error de red');
        }
        return null;
      } finally {
        clearTimeout(timeoutId);
        setIsSubmitting(false);
        abortRef.current = null;
      }
    },
    [],
  );

  return { submit, cancel, progress, isSubmitting, error, report, reset };
}
