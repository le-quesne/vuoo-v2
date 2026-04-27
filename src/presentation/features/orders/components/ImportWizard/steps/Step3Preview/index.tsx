/**
 * Step 3 — Preview con geocoding chunked, dedup vs DB y match review.
 *
 * Pipeline:
 *
 *    rawRows + mapping ──► applyMapping ──► PreviewRow[] (in-memory)
 *                                                 │
 *                                                 ▼
 *                                  ┌──── geocoding chunked (200/c) ────┐
 *                                  ▼                                    │
 *                          enriched.lat/lng/match                       │
 *                                                                        │
 *                          ◄──── checkExisting(orgId, orderNumbers)      │
 *                                                                        ▼
 *                                                 dedup + intra-file dupes
 *
 * Filas con error o geocoding error NO avanzan al submit.
 * Filas con order_number duplicado (intra-file o vs DB) se filtran al submit.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, X, Circle, UserCheck, UserPlus } from 'lucide-react';
import { DEFAULT_CENTER } from '@/application/lib/mapbox';
import { useAuth } from '@/application/hooks/useAuth';
import { ordersService } from '@/data/services/orders';
import type {
  CanonicalColumn,
  MappingConfig,
  MatchQuality,
  PreviewRow,
  WizardState,
} from '../../types/import.types';
import { findIntraFileDuplicates, aggregateByOrderNumber } from '../../utils/mapping';
import { runGeocoding } from './runGeocoding';
import { GeoBadge, MatchBadge } from './badges';
import { PinDropMap } from './PinDropMap';
import { MatchReviewModal } from './MatchReviewModal';
import { DedupBanner } from './DedupBanner';
import { PreviewTable } from './PreviewTable';
import { RawRowModal } from './RawRowModal';

interface Step3PreviewProps {
  state: WizardState;
  onPreviewRowsChange: (rows: PreviewRow[]) => void;
  onLoadingChange: (loading: boolean) => void;
  onMediumPolicyChange: (policy: WizardState['mediumPolicy']) => void;
  onDedupExistingChange: (existing: string[]) => void;
}

function applyMapping(
  rawRow: Record<string, string>,
  mapping: MappingConfig,
): Partial<Record<CanonicalColumn, string>> {
  const out: Partial<Record<CanonicalColumn, string>> = {};
  (Object.keys(mapping) as CanonicalColumn[]).forEach((col) => {
    const header = mapping[col];
    if (header && rawRow[header] != null) {
      out[col] = rawRow[header];
    }
  });
  return out;
}

function buildPreviewRows(
  raw: Record<string, string>[],
  mapping: MappingConfig,
): PreviewRow[] {
  return raw.map((r, idx) => {
    const values = applyMapping(r, mapping);
    const hasName = (values.customer_name ?? '').trim().length > 0;
    const hasAddress = (values.address ?? '').trim().length > 0;
    const hasCode = (values.customer_code ?? '').trim().length > 0;

    let error: string | undefined;
    let warnings: string[] = [];
    let geocodingStatus: PreviewRow['geocodingStatus'];

    if (!hasName) {
      error = 'Falta nombre de cliente';
      geocodingStatus = 'error';
    } else if (!hasAddress && !hasCode) {
      error = 'Falta dirección o código de cliente';
      geocodingStatus = 'error';
    } else if (!hasAddress && hasCode) {
      // Sin address pero con código: backend lo resuelve. Si no resuelve,
      // queda como pendiente. No bloquea el import.
      geocodingStatus = 'ok';
      warnings = ['Sin dirección — se resolverá por código de cliente o quedará pendiente.'];
    } else {
      geocodingStatus = 'pending';
    }

    return {
      id: `row-${idx}`,
      values,
      raw: r,
      geocodingStatus,
      lat: null,
      lng: null,
      matchQuality: 'none' as MatchQuality,
      stopId: null,
      overrideCreateNew: false,
      warnings,
      error,
    };
  });
}

function statusFromConfidence(c: number): PreviewRow['geocodingStatus'] {
  if (c >= 0.6) return 'ok';
  if (c > 0) return 'warning';
  return 'error';
}

export function Step3Preview({
  state,
  onPreviewRowsChange,
  onLoadingChange,
  onMediumPolicyChange,
  onDedupExistingChange,
}: Step3PreviewProps) {
  const { currentOrg } = useAuth();
  const [pinDropRowId, setPinDropRowId] = useState<string | null>(null);
  const [matchReviewRowId, setMatchReviewRowId] = useState<string | null>(null);
  const [rawRowId, setRawRowId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isCheckingDedup, setIsCheckingDedup] = useState(false);
  const [geocodingProgress, setGeocodingProgress] = useState({ done: 0, total: 0 });
  const abortRef = useRef<AbortController | null>(null);

  // Construimos las filas crudas y luego las agrupamos por order_number.
  // Esto convierte 5 líneas de la misma factura en 1 sola orden con peso/volumen
  // sumados, en vez de marcar 4 como duplicados omitidos.
  const aggregated = useMemo(() => {
    const raw = buildPreviewRows(state.rawRows, state.mapping);
    return aggregateByOrderNumber(raw);
  }, [state.rawRows, state.mapping]);

  const baseRows = aggregated.rows;
  const aggregationStats = {
    mergedCount: aggregated.mergedCount,
    groupedOrders: aggregated.groupedOrders,
  };

  // Geocoding + match al entrar al step.
  useEffect(() => {
    if (state.previewRows.length > 0) return;
    if (baseRows.length === 0) return;

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    async function run() {
      onLoadingChange(true);
      setLocalError(null);
      setGeocodingProgress({ done: 0, total: 0 });

      const inputs = baseRows
        .filter((r) => !r.error && (r.values.address ?? '').trim().length > 0)
        .map((r) => ({ id: r.id, address: r.values.address!.trim() }));

      if (inputs.length === 0) {
        onPreviewRowsChange(baseRows);
        onLoadingChange(false);
        return;
      }

      const result = await runGeocoding({
        inputs,
        signal: ctrl.signal,
        onProgress: setGeocodingProgress,
      });

      if (result.cancelled) {
        onLoadingChange(false);
        return;
      }

      if (result.errors.length > 0) {
        setLocalError(
          `Algunas direcciones no pudieron geocodificarse (${result.errors.length} errores). Revisá las filas marcadas en rojo.`,
        );
      }

      const enriched: PreviewRow[] = baseRows.map((r) => {
        if (r.error) return r;
        const g = result.results.get(r.id);
        if (!g || g.lat == null || g.lng == null) {
          return {
            ...r,
            geocodingStatus: 'error',
            warnings: [...r.warnings, 'No se pudo geocodificar'],
          };
        }
        const matchQuality = g.matchQuality ?? 'none';
        return {
          ...r,
          lat: g.lat,
          lng: g.lng,
          geocodingConfidence: g.confidence,
          geocodingStatus: statusFromConfidence(g.confidence),
          matchQuality,
          stopId: g.stopCandidateId ?? null,
          matchCandidate: g.stopCandidateId
            ? {
                id: g.stopCandidateId,
                address: g.candidateAddress ?? '',
                customerName: g.candidateCustomerName ?? null,
                useCount: g.candidateUseCount ?? 0,
              }
            : undefined,
        };
      });

      onPreviewRowsChange(enriched);
      onLoadingChange(false);
    }

    void run();
    return () => {
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseRows]);

  // Dedup vs DB (D4).
  useEffect(() => {
    if (!currentOrg || state.previewRows.length === 0) return;
    const numbers = state.previewRows
      .map((r) => r.values.order_number?.trim())
      .filter((n): n is string => !!n);
    if (numbers.length === 0) {
      onDedupExistingChange([]);
      return;
    }
    let cancelled = false;
    setIsCheckingDedup(true);
    void ordersService
      .checkExisting(currentOrg.id, numbers)
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          onDedupExistingChange(res.data.existing);
        }
        setIsCheckingDedup(false);
      })
      .catch(() => {
        if (cancelled) return;
        setIsCheckingDedup(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.previewRows, currentOrg]);

  const rows = state.previewRows.length > 0 ? state.previewRows : baseRows;

  const intraFileDupes = useMemo(() => findIntraFileDuplicates(rows), [rows]);
  const duplicatedSet = useMemo(() => {
    const s = new Set<string>(intraFileDupes);
    state.dedupExisting.forEach((n) => s.add(n));
    return s;
  }, [intraFileDupes, state.dedupExisting]);

  const counters = useMemo(() => {
    let high = 0;
    let medium = 0;
    let newOnes = 0;
    let errors = 0;
    let dedupSkipped = 0;
    for (const r of rows) {
      const num = r.values.order_number?.trim();
      const isDup = !!num && duplicatedSet.has(num);
      if (r.error || r.geocodingStatus === 'error') {
        errors++;
        continue;
      }
      if (isDup) {
        dedupSkipped++;
        continue;
      }
      const willReuse = r.matchQuality === 'medium'
        ? !r.overrideCreateNew && state.mediumPolicy === 'reuse'
        : false;
      if (willReuse || r.matchQuality === 'high') {
        if (r.matchQuality === 'high') high++;
        else medium++;
      } else {
        newOnes++;
      }
    }
    return { total: rows.length, high, medium, newOnes, errors, dedupSkipped };
  }, [rows, duplicatedSet, state.mediumPolicy]);

  const updateRow = useCallback(
    (rowId: string, patch: Partial<PreviewRow>) => {
      onPreviewRowsChange(rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
    },
    [rows, onPreviewRowsChange],
  );

  const pinDropRow = pinDropRowId ? rows.find((r) => r.id === pinDropRowId) : null;
  const matchReviewRow = matchReviewRowId ? rows.find((r) => r.id === matchReviewRowId) : null;
  const rawRow = rawRowId ? rows.find((r) => r.id === rawRowId) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
        <span className="font-medium text-gray-900">
          {counters.total} pedido{counters.total === 1 ? '' : 's'}
        </span>
        <span className="text-gray-400">•</span>
        <span className="inline-flex items-center gap-1.5 text-blue-700">
          <UserCheck size={14} />
          {counters.high} conocidos
        </span>
        <span className="inline-flex items-center gap-1.5 text-amber-700">
          <Circle size={10} className="fill-amber-400 stroke-amber-600" />
          {counters.medium} a revisar
        </span>
        <span className="inline-flex items-center gap-1.5 text-gray-600">
          <UserPlus size={14} />
          {counters.newOnes} nuevos
        </span>
        {counters.dedupSkipped > 0 && (
          <span className="inline-flex items-center gap-1.5 text-amber-800">
            <AlertCircle size={14} />
            {counters.dedupSkipped} duplicados (omitidos)
          </span>
        )}
        {counters.errors > 0 && (
          <span className="inline-flex items-center gap-1.5 text-red-700">
            <AlertCircle size={14} />
            {counters.errors} con errores
          </span>
        )}
      </div>

      {aggregationStats.mergedCount > 0 && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
          <span className="text-base leading-none mt-0.5">📦</span>
          <div className="space-y-1">
            <div>
              <span className="font-medium">{state.rawRows.length} líneas del archivo → {rows.length} pedidos.</span>
              {' '}
              {aggregationStats.mergedCount} línea{aggregationStats.mergedCount === 1 ? '' : 's'}
              {' '}con factura repetida
              {' '}{aggregationStats.mergedCount === 1 ? 'se agrupó' : 'se agruparon'} en{' '}
              {aggregationStats.groupedOrders} pedido
              {aggregationStats.groupedOrders === 1 ? '' : 's'}; el resto ya era único.
            </div>
            <div className="text-[11px] opacity-80">
              Pesos y volúmenes se sumaron por grupo; descripciones quedaron concatenadas en notas.
            </div>
          </div>
        </div>
      )}

      <DedupBanner
        isChecking={isCheckingDedup}
        existingCount={state.dedupExisting.length}
        intraFileDuplicates={intraFileDupes}
      />

      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-blue-50/50 border border-blue-100 rounded-lg">
        <div>
          <div className="text-xs font-medium text-blue-900">
            Política para matches "a revisar"
          </div>
          <div className="text-[11px] text-blue-700">
            Aplica al global; podés cambiar fila por fila después.
          </div>
        </div>
        <select
          value={state.mediumPolicy}
          onChange={(e) => onMediumPolicyChange(e.target.value as WizardState['mediumPolicy'])}
          className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs text-blue-900"
        >
          <option value="reuse">Reusar el stop existente</option>
          <option value="create_new">Crear ubicación nueva</option>
        </select>
      </div>

      {localError && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{localError}</span>
        </div>
      )}

      {state.isPreviewLoading && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Loader2 size={14} className="animate-spin" />
            Geocodificando direcciones…{' '}
            {geocodingProgress.total > 0 &&
              `(${geocodingProgress.done}/${geocodingProgress.total})`}
          </div>
          {geocodingProgress.total > 0 && (
            <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-[width] duration-300"
                style={{ width: `${(geocodingProgress.done / geocodingProgress.total) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      <PreviewTable
        rows={rows}
        duplicatedOrderNumbers={duplicatedSet}
        onPinDrop={setPinDropRowId}
        onMatchReview={setMatchReviewRowId}
        onShowRaw={setRawRowId}
      />

      <div className="text-xs text-gray-500">
        Las filas con error o duplicadas no se importarán. El resto sí, incluso las que requieren
        revisión manual.
      </div>

      {pinDropRow && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPinDropRowId(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-2xl rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Ajustar ubicación</h3>
                <p className="text-xs text-gray-500 mt-0.5">{pinDropRow.values.address}</p>
              </div>
              <button onClick={() => setPinDropRowId(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-4">
              <PinDropMap
                lat={pinDropRow.lat ?? DEFAULT_CENTER[1]}
                lng={pinDropRow.lng ?? DEFAULT_CENTER[0]}
                onChange={(lat, lng) => {
                  const nextWarnings = pinDropRow.warnings.includes('Corregido manualmente')
                    ? pinDropRow.warnings
                    : [...pinDropRow.warnings, 'Corregido manualmente'];
                  updateRow(pinDropRow.id, {
                    lat,
                    lng,
                    geocodingStatus: 'ok',
                    geocodingConfidence: 1,
                    warnings: nextWarnings,
                  });
                }}
              />
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setPinDropRowId(null)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <CheckCircle2 size={14} />
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {matchReviewRow && (
        <MatchReviewModal
          row={matchReviewRow}
          onClose={() => setMatchReviewRowId(null)}
          onReuseStop={() => {
            updateRow(matchReviewRow.id, { overrideCreateNew: false });
            setMatchReviewRowId(null);
          }}
          onCreateNew={() => {
            updateRow(matchReviewRow.id, { overrideCreateNew: true, stopId: null });
            setMatchReviewRowId(null);
          }}
        />
      )}

      {rawRow && <RawRowModal row={rawRow} onClose={() => setRawRowId(null)} />}
    </div>
  );
}

// Mantengo el export `Step3Preview` para que el import sin path interno siga funcionando.
export { Step3Preview as default };
// Re-exports usados por badges/MatchBadge si alguien los necesita externos.
export { GeoBadge, MatchBadge };
