/**
 * Transformaciones canonical-row → dominio del wizard.
 *
 * `applyMapping` se usa en Step3 para construir el preview.
 * `previewRowToImportRow` se usa en Step4 para armar el payload del backend.
 *
 * Las dos viven acá juntas porque comparten el contrato canonical-column ↔ valor.
 */
import type {
  CanonicalColumn,
  MappingConfig,
  PreviewRow,
} from '../types/import.types';
import type { ImportRow } from '@/data/services/orders/orders.services';

export function applyMapping(
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

export interface NumberWithWarning {
  value: number | undefined;
  warning?: string;
}

/**
 * Convierte texto a número manejando coma decimal y stripping unidades comunes.
 * "5,5" → 5.5, "3 kg" → 3, "10 m3" → 10. "abc" → undefined+warning.
 */
export function toOptionalNumber(raw: string | undefined): NumberWithWarning {
  if (raw == null || raw === '') return { value: undefined };
  const original = String(raw).trim();
  // strip unidades comunes en LATAM
  const stripped = original.replace(/\s*(kg|g|lt|l|cc|ml|m3|m³|kw|cm|mm)\s*$/i, '').trim();
  const normalized = stripped.replace(',', '.');
  const n = Number(normalized);
  if (!Number.isFinite(n)) {
    return {
      value: undefined,
      warning: `Valor numérico no parseable: "${original}"`,
    };
  }
  if (stripped !== original) {
    return { value: n };
  }
  return { value: n };
}

export interface PriorityWithWarning {
  value: 'urgent' | 'high' | 'normal' | 'low' | undefined;
  warning?: string;
}

const PRIORITY_ALIASES: Record<string, 'urgent' | 'high' | 'normal' | 'low'> = {
  urgent: 'urgent',
  urgente: 'urgent',
  high: 'high',
  alta: 'high',
  alto: 'high',
  normal: 'normal',
  media: 'normal',
  medium: 'normal',
  low: 'low',
  baja: 'low',
  bajo: 'low',
};

export function normalizePriority(raw: string | undefined): PriorityWithWarning {
  if (!raw || !raw.trim()) return { value: undefined };
  const key = raw.trim().toLowerCase();
  const mapped = PRIORITY_ALIASES[key];
  if (mapped) return { value: mapped };
  return {
    value: 'normal',
    warning: `Prioridad desconocida "${raw.trim()}", usando 'normal'`,
  };
}

export interface PreviewRowToImportRowResult {
  row: ImportRow;
  warnings: string[];
}

export function previewRowToImportRow(r: PreviewRow): PreviewRowToImportRowResult {
  const warnings: string[] = [];

  const weight = toOptionalNumber(r.values.total_weight_kg);
  if (weight.warning) warnings.push(weight.warning);

  const volume = toOptionalNumber(r.values.volume_m3);
  if (volume.warning) warnings.push(volume.warning);

  const priority = normalizePriority(r.values.priority);
  if (priority.warning) warnings.push(priority.warning);

  const trimmedAddress = (r.values.address ?? '').trim();
  const trimmedCode = (r.values.customer_code ?? '').trim();

  const row: ImportRow = {
    customer_name: (r.values.customer_name ?? '').trim(),
    customer_code: trimmedCode || null,
    customer_phone: r.values.customer_phone?.trim() || null,
    customer_email: r.values.customer_email?.trim() || null,
    // address puede ser null cuando solo viene customer_code y el backend
    // lo resuelve via catálogo (o lo deja pendiente).
    address: trimmedAddress || null,
    lat: r.lat,
    lng: r.lng,
    total_weight_kg: weight.value ?? 0,
    total_volume_m3: volume.value ?? null,
    time_window_start: r.values.time_window_start?.trim() || null,
    time_window_end: r.values.time_window_end?.trim() || null,
    priority: priority.value,
    requested_date: r.values.requested_date?.trim() || null,
    order_number: r.values.order_number?.trim() || undefined,
    internal_notes: r.values.internal_notes?.trim() || null,
  };

  return { row, warnings };
}

/**
 * Detecta duplicados de order_number dentro del mismo CSV antes del submit.
 * Devuelve los order_numbers que aparecen más de una vez.
 */
export function findIntraFileDuplicates(rows: PreviewRow[]): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const num = r.values.order_number?.trim();
    if (!num) continue;
    counts.set(num, (counts.get(num) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, c]) => c > 1)
    .map(([num]) => num);
}

/**
 * Agrupa filas que comparten `order_number` (típico de exports ERP donde cada
 * fila es una línea de factura). Mergea cantidades sumando peso/volumen,
 * concatena notas, y mantiene customer info del primer match.
 *
 * Filas sin `order_number` se mantienen tal cual (cada una es única).
 * Si en un grupo hay customer_codes distintos, se mantiene el primero
 * y se emite un warning (no debería pasar pero por defensiva).
 */
export interface AggregateResult {
  rows: PreviewRow[];
  /** Cantidad de filas originales que quedaron mergeadas en alguna agrupación. */
  mergedCount: number;
  /** Cantidad de pedidos finales que provienen de múltiples filas. */
  groupedOrders: number;
}

export function aggregateByOrderNumber(rows: PreviewRow[]): AggregateResult {
  const byKey = new Map<string, PreviewRow[]>();
  const ungrouped: PreviewRow[] = [];

  for (const r of rows) {
    const num = r.values.order_number?.trim();
    if (!num) {
      ungrouped.push(r);
      continue;
    }
    if (!byKey.has(num)) byKey.set(num, []);
    byKey.get(num)!.push(r);
  }

  const aggregated: PreviewRow[] = [];
  let mergedCount = 0;
  let groupedOrders = 0;

  function num(s: string | undefined): number {
    if (s == null || String(s).trim() === '') return 0;
    const n = Number(String(s).replace(',', '.').replace(/[^\d.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  for (const [, group] of byKey) {
    if (group.length === 1) {
      aggregated.push(group[0]);
      continue;
    }

    groupedOrders++;
    mergedCount += group.length - 1;

    // Mantenemos un PreviewRow base con id/raw del primero para que la UI
    // referencie esa fila si el dispatcher abre "ver original".
    const base = group[0];

    const sumWeight = group.reduce((acc, r) => acc + num(r.values.total_weight_kg), 0);
    const sumVolume = group.reduce((acc, r) => acc + num(r.values.volume_m3), 0);

    const notesList = group
      .map((r) => r.values.internal_notes?.trim())
      .filter((s): s is string => !!s);
    const mergedNotes = notesList.length > 0 ? notesList.join(' · ') : base.values.internal_notes;

    // Si los códigos no coinciden entre filas del mismo order_number, lo
    // marcamos como warning. En Datasul real esto no debería pasar.
    const codes = new Set(
      group.map((r) => r.values.customer_code?.trim()).filter(Boolean) as string[],
    );
    const codeMismatch = codes.size > 1;

    const warnings = [
      ...base.warnings,
      `Agrupado de ${group.length} líneas (mismo número de pedido).`,
      ...(codeMismatch
        ? [`Códigos de cliente distintos en el grupo: ${Array.from(codes).join(', ')}. Se usó el primero.`]
        : []),
    ];

    aggregated.push({
      ...base,
      values: {
        ...base.values,
        total_weight_kg: sumWeight > 0 ? String(sumWeight) : base.values.total_weight_kg,
        volume_m3: sumVolume > 0 ? String(sumVolume) : base.values.volume_m3,
        internal_notes: mergedNotes,
      },
      warnings,
    });
  }

  return { rows: [...ungrouped, ...aggregated], mergedCount, groupedOrders };
}
