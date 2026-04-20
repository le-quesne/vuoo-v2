// Tipos compartidos por el ImportWizard.
// El reporte del backend viene de data/services/orders/orders.types.ts
// (creado por el agente paralelo). Lo re-declaramos acá como fallback tipado
// defensivo para que la UI no dependa del orden de merges.

export type GeocodingStatus = 'ok' | 'warning' | 'error' | 'pending';
export type MatchQuality = 'high' | 'medium' | 'low' | 'none';

/**
 * Columnas canónicas que el operador puede mapear desde su CSV.
 * Los nombres coinciden con los campos que `orders.services.bulkCreate`
 * espera en cada `OrderInsert`.
 */
export const CANONICAL_COLUMNS = [
  'customer_name',
  'customer_phone',
  'customer_email',
  'address',
  'total_weight_kg',
  'volume_m3',
  'time_window_start',
  'time_window_end',
  'requested_date',
  'priority',
  'service_duration_minutes',
  'internal_notes',
  'order_number',
] as const;

export type CanonicalColumn = (typeof CANONICAL_COLUMNS)[number];

/** Etiquetas legibles en español para la UI de mapping. */
export const CANONICAL_LABELS: Record<CanonicalColumn, string> = {
  customer_name: 'Nombre del cliente',
  customer_phone: 'Teléfono',
  customer_email: 'Email',
  address: 'Dirección',
  total_weight_kg: 'Peso (kg)',
  volume_m3: 'Volumen (m³)',
  time_window_start: 'Ventana inicio',
  time_window_end: 'Ventana fin',
  requested_date: 'Fecha solicitada',
  priority: 'Prioridad',
  service_duration_minutes: 'Duración servicio (min)',
  internal_notes: 'Notas internas',
  order_number: 'N° de pedido',
};

/** Columnas obligatorias — sin estas no podemos crear el order. */
export const REQUIRED_COLUMNS: CanonicalColumn[] = ['customer_name', 'address'];

/**
 * Mapeo columna canónica → header del archivo CSV.
 * `null` significa "no mapeada" (dejaremos el valor vacío / default).
 */
export type MappingConfig = Record<CanonicalColumn, string | null>;

/** Fila ya preparada para preview / confirmación. */
export interface PreviewRow {
  /** id temporal estable para claves de render. */
  id: string;
  /** valores por columna canónica (ya aplicado el mapping). */
  values: Partial<Record<CanonicalColumn, string>>;
  /** raw row original para debugging. */
  raw: Record<string, string>;
  /** estado del geocoding de la dirección. */
  geocodingStatus: GeocodingStatus;
  geocodingConfidence?: number;
  lat: number | null;
  lng: number | null;
  /** match contra catálogo de stops existente. */
  matchQuality: MatchQuality;
  /** stop_id si reusa uno existente. null cuando se crea nuevo. */
  stopId: string | null;
  /** detalles del stop candidato (para el modal comparativo). */
  matchCandidate?: {
    id: string;
    address: string;
    customerName: string | null;
    useCount: number;
  };
  /** si el operador forzó ignorar el match y crear uno nuevo. */
  overrideCreateNew: boolean;
  warnings: string[];
  /** error de validación del mapping (ej. sin customer_name). */
  error?: string;
}

/** Resumen devuelto por el backend. */
export interface ImportReport {
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

/** Estado global del wizard, compartido entre steps via context. */
export interface WizardState {
  step: 1 | 2 | 3 | 4;
  file: File | null;
  fileName: string;
  headers: string[];
  rawRows: Record<string, string>[];
  mapping: MappingConfig;
  templateId: string | null;
  previewRows: PreviewRow[];
  isPreviewLoading: boolean;
  importProgress: number;
  importReport: ImportReport | null;
  error: string | null;
}

export function emptyMapping(): MappingConfig {
  return CANONICAL_COLUMNS.reduce<MappingConfig>((acc, col) => {
    acc[col] = null;
    return acc;
  }, {} as MappingConfig);
}
