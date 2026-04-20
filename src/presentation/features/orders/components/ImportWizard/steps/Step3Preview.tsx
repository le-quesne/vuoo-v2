import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MapPin,
  X,
  Circle,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { MAPBOX_TOKEN, MAP_STYLE, DEFAULT_CENTER, DEFAULT_ZOOM } from '@/application/lib/mapbox';
import * as geocodingModule from '@/data/services/geocoding';
import type {
  CanonicalColumn,
  MappingConfig,
  MatchQuality,
  PreviewRow,
  WizardState,
} from '../types/import.types';

mapboxgl.accessToken = MAPBOX_TOKEN;

interface Step3PreviewProps {
  state: WizardState;
  onPreviewRowsChange: (rows: PreviewRow[]) => void;
  onLoadingChange: (loading: boolean) => void;
}

// ──────────────────────────────────────────────────────────────────────────
// Servicio de geocoding resuelto dinámicamente (Railway).
// El frontend NO debe llamar a Mapbox directo para geocoding.
// ──────────────────────────────────────────────────────────────────────────
interface GeocodeResult {
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

type GeocodingService = {
  batch: (
    addresses: { id: string; address: string }[],
  ) => Promise<
    | { success: true; data: GeocodeResult[] }
    | { success: false; error: string }
  >;
};

function resolveGeocoding(): GeocodingService | null {
  const mod = geocodingModule as unknown as Record<string, unknown>;
  const svc =
    (mod.geocodingService as GeocodingService | undefined) ??
    (mod as unknown as GeocodingService);
  if (svc && typeof svc.batch === 'function') return svc;
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────
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
    let error: string | undefined;
    if (!hasName) error = 'Falta nombre de cliente';
    else if (!hasAddress) error = 'Falta dirección';

    return {
      id: `row-${idx}`,
      values,
      raw: r,
      geocodingStatus: hasAddress ? 'pending' : 'error',
      lat: null,
      lng: null,
      matchQuality: 'none' as MatchQuality,
      stopId: null,
      overrideCreateNew: false,
      warnings: [],
      error,
    };
  });
}

function statusFromConfidence(c: number): PreviewRow['geocodingStatus'] {
  if (c >= 0.6) return 'ok';
  if (c > 0) return 'warning';
  return 'error';
}

function GeoBadge({ status }: { status: PreviewRow['geocodingStatus'] }) {
  if (status === 'ok') {
    return (
      <span
        className="inline-flex items-center gap-1 text-emerald-600"
        title="Geocoding confiable"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
      </span>
    );
  }
  if (status === 'warning') {
    return (
      <span
        className="inline-flex items-center gap-1 text-amber-600"
        title="Geocoding con baja confianza"
      >
        <span className="h-2 w-2 rounded-full bg-amber-500" />
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span
        className="inline-flex items-center gap-1 text-red-600"
        title="No se pudo geocodificar"
      >
        <span className="h-2 w-2 rounded-full bg-red-500" />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-gray-400" title="Pendiente">
      <Loader2 size={12} className="animate-spin" />
    </span>
  );
}

function MatchBadge({
  row,
  onClick,
}: {
  row: PreviewRow;
  onClick?: () => void;
}) {
  const effective: MatchQuality = row.overrideCreateNew
    ? 'none'
    : row.matchQuality;
  if (effective === 'high') {
    return (
      <span
        className="inline-flex items-center gap-1 text-blue-700"
        title="Cliente conocido"
      >
        <UserCheck size={12} />
        <span className="text-[11px]">Conocido</span>
      </span>
    );
  }
  if (effective === 'medium') {
    return (
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1 text-amber-700 hover:underline"
        title="Revisar match"
      >
        <Circle size={10} className="fill-amber-400 stroke-amber-600" />
        <span className="text-[11px]">Revisar</span>
      </button>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-gray-500"
      title="Nueva ubicación"
    >
      <UserPlus size={12} />
      <span className="text-[11px]">Nueva</span>
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Mini mapa Mapbox con marker draggable para pin-drop.
// ──────────────────────────────────────────────────────────────────────────
interface PinDropMapProps {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}

function PinDropMap({ lat, lng, onChange }: PinDropMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const hasCoord = Number.isFinite(lat) && Number.isFinite(lng);
    const center: [number, number] = hasCoord ? [lng, lat] : DEFAULT_CENTER;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center,
      zoom: hasCoord ? 14 : DEFAULT_ZOOM,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    const marker = new mapboxgl.Marker({ draggable: true, color: '#2563eb' })
      .setLngLat(center)
      .addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLngLat();
      onChangeRef.current(pos.lat, pos.lng);
    });

    markerRef.current = marker;
    mapRef.current = map;

    return () => {
      marker.remove();
      map.remove();
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [lat, lng]);

  return <div ref={containerRef} className="w-full h-64 rounded-lg" />;
}

// ──────────────────────────────────────────────────────────────────────────
// Modal comparativo de match medium (order vs stop existente).
// ──────────────────────────────────────────────────────────────────────────
interface MatchReviewModalProps {
  row: PreviewRow;
  onClose: () => void;
  onReuseStop: () => void;
  onCreateNew: () => void;
}

function MatchReviewModal({
  row,
  onClose,
  onReuseStop,
  onCreateNew,
}: MatchReviewModalProps) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">
            Revisar match de ubicación
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-0 border-b border-gray-100">
          <div className="p-5 border-r border-gray-100">
            <div className="text-xs font-semibold uppercase text-gray-500 mb-2">
              Del CSV
            </div>
            <div className="space-y-1.5 text-sm">
              <div>
                <span className="text-gray-500">Cliente: </span>
                <span className="text-gray-900">
                  {row.values.customer_name || '—'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Dirección: </span>
                <span className="text-gray-900">{row.values.address || '—'}</span>
              </div>
              {row.values.customer_phone && (
                <div>
                  <span className="text-gray-500">Teléfono: </span>
                  <span className="text-gray-900">{row.values.customer_phone}</span>
                </div>
              )}
            </div>
          </div>

          <div className="p-5">
            <div className="text-xs font-semibold uppercase text-gray-500 mb-2">
              Stop existente
            </div>
            {row.matchCandidate ? (
              <div className="space-y-1.5 text-sm">
                <div>
                  <span className="text-gray-500">Cliente: </span>
                  <span className="text-gray-900">
                    {row.matchCandidate.customerName || '—'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Dirección: </span>
                  <span className="text-gray-900">
                    {row.matchCandidate.address}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Veces usada: </span>
                  <span className="text-gray-900">
                    {row.matchCandidate.useCount}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-400 italic">
                Sin candidato disponible
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 bg-gray-50 rounded-b-xl">
          <button
            onClick={onCreateNew}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Crear ubicación nueva
          </button>
          <button
            onClick={onReuseStop}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Usar este stop
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Step 3: Preview principal
// ──────────────────────────────────────────────────────────────────────────
export function Step3Preview({
  state,
  onPreviewRowsChange,
  onLoadingChange,
}: Step3PreviewProps) {
  const [pinDropRowId, setPinDropRowId] = useState<string | null>(null);
  const [matchReviewRowId, setMatchReviewRowId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // Construir las filas de preview la primera vez que entramos al step,
  // o cuando cambia el mapping/raw.
  const baseRows = useMemo(
    () => buildPreviewRows(state.rawRows, state.mapping),
    [state.rawRows, state.mapping],
  );

  // Geocodificar en batch vía Railway.
  useEffect(() => {
    if (state.previewRows.length > 0) return; // ya corrimos
    if (baseRows.length === 0) return;

    let cancelled = false;
    async function run() {
      onLoadingChange(true);
      setLocalError(null);
      const svc = resolveGeocoding();
      if (!svc) {
        // Sin servicio disponible: dejamos el preview con status 'error' para las filas válidas.
        onPreviewRowsChange(
          baseRows.map((r) => ({
            ...r,
            geocodingStatus: r.error ? 'error' : 'error',
            warnings: r.error
              ? r.warnings
              : [...r.warnings, 'Servicio de geocoding no disponible'],
          })),
        );
        setLocalError(
          'El servicio de geocoding no está disponible. Podés continuar, el backend reintentará al importar.',
        );
        onLoadingChange(false);
        return;
      }

      const payload = baseRows
        .filter((r) => !r.error)
        .map((r) => ({ id: r.id, address: r.values.address!.trim() }));

      const res = await svc.batch(payload);
      if (cancelled) return;

      if (!res.success) {
        setLocalError(res.error);
        onPreviewRowsChange(
          baseRows.map((r) =>
            r.error
              ? r
              : { ...r, geocodingStatus: 'error', warnings: [res.error] },
          ),
        );
        onLoadingChange(false);
        return;
      }

      const byId = new Map<string, GeocodeResult>();
      for (const g of res.data) byId.set(g.id, g);

      const enriched: PreviewRow[] = baseRows.map((r) => {
        if (r.error) return r;
        const g = byId.get(r.id);
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
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseRows]);

  const rows = state.previewRows.length > 0 ? state.previewRows : baseRows;

  const counters = useMemo(() => {
    let high = 0;
    let medium = 0;
    let newOnes = 0;
    let errors = 0;
    for (const r of rows) {
      if (r.error || r.geocodingStatus === 'error') {
        errors++;
        continue;
      }
      if (r.overrideCreateNew) {
        newOnes++;
        continue;
      }
      if (r.matchQuality === 'high') high++;
      else if (r.matchQuality === 'medium') medium++;
      else newOnes++;
    }
    return { total: rows.length, high, medium, newOnes, errors };
  }, [rows]);

  const updateRow = useCallback(
    (rowId: string, patch: Partial<PreviewRow>) => {
      onPreviewRowsChange(
        rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
      );
    },
    [rows, onPreviewRowsChange],
  );

  const pinDropRow = pinDropRowId ? rows.find((r) => r.id === pinDropRowId) : null;
  const matchReviewRow = matchReviewRowId
    ? rows.find((r) => r.id === matchReviewRowId)
    : null;

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
        {counters.errors > 0 && (
          <span className="inline-flex items-center gap-1.5 text-red-700">
            <AlertCircle size={14} />
            {counters.errors} con errores
          </span>
        )}
      </div>

      {localError && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{localError}</span>
        </div>
      )}

      {state.isPreviewLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={14} className="animate-spin" />
          Geocodificando direcciones…
        </div>
      )}

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-medium w-8">#</th>
                <th className="px-3 py-2 text-left font-medium">Cliente</th>
                <th className="px-3 py-2 text-left font-medium">Dirección</th>
                <th className="px-3 py-2 text-left font-medium w-24">Geo</th>
                <th className="px-3 py-2 text-left font-medium w-28">Match</th>
                <th className="px-3 py-2 text-left font-medium w-24">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const isError = !!r.error || r.geocodingStatus === 'error';
                return (
                  <tr
                    key={r.id}
                    className={[
                      'border-t border-gray-100',
                      isError ? 'bg-red-50/40' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-3 py-2 truncate max-w-[180px]">
                      {r.values.customer_name || (
                        <span className="text-gray-400 italic">sin nombre</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs truncate max-w-[260px]">
                      {r.values.address || (
                        <span className="text-gray-400 italic">sin dirección</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <GeoBadge status={r.geocodingStatus} />
                    </td>
                    <td className="px-3 py-2">
                      {!isError && (
                        <MatchBadge
                          row={r}
                          onClick={
                            r.matchQuality === 'medium' && !r.overrideCreateNew
                              ? () => setMatchReviewRowId(r.id)
                              : undefined
                          }
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.geocodingStatus === 'warning' && (
                        <button
                          onClick={() => setPinDropRowId(r.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800 hover:bg-amber-100"
                          title="Ajustar ubicación manualmente"
                        >
                          <MapPin size={12} />
                          Pin
                        </button>
                      )}
                      {r.geocodingStatus === 'error' && !r.error && (
                        <button
                          onClick={() => setPinDropRowId(r.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800 hover:bg-red-100"
                        >
                          <MapPin size={12} />
                          Pin
                        </button>
                      )}
                      {r.error && (
                        <span className="text-[11px] text-red-700">
                          {r.error}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-gray-500">
        Las filas con error no se importarán. El resto sí, incluso las que
        requieren revisión manual.
      </div>

      {/* Pin-drop modal */}
      {pinDropRow && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPinDropRowId(null)}
        >
          <div
            className="w-full max-w-2xl rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  Ajustar ubicación
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {pinDropRow.values.address}
                </p>
              </div>
              <button
                onClick={() => setPinDropRowId(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4">
              <PinDropMap
                lat={pinDropRow.lat ?? DEFAULT_CENTER[1]}
                lng={pinDropRow.lng ?? DEFAULT_CENTER[0]}
                onChange={(lat, lng) =>
                  updateRow(pinDropRow.id, {
                    lat,
                    lng,
                    geocodingStatus: 'ok',
                    geocodingConfidence: 1,
                    warnings: [...pinDropRow.warnings, 'Corregido manualmente'],
                  })
                }
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

      {/* Match review modal */}
      {matchReviewRow && (
        <MatchReviewModal
          row={matchReviewRow}
          onClose={() => setMatchReviewRowId(null)}
          onReuseStop={() => {
            updateRow(matchReviewRow.id, { overrideCreateNew: false });
            setMatchReviewRowId(null);
          }}
          onCreateNew={() => {
            updateRow(matchReviewRow.id, {
              overrideCreateNew: true,
              stopId: null,
            });
            setMatchReviewRowId(null);
          }}
        />
      )}
    </div>
  );
}
