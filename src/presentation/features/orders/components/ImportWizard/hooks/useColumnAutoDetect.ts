import { useMemo } from 'react';
import type { CanonicalColumn, MappingConfig } from '../types/import.types';
import { CANONICAL_COLUMNS, emptyMapping } from '../types/import.types';

/**
 * Heurística de alias reusada del viejo ImportCsvModal (utils/csv.ts NO
 * contiene la heurística — vive inline en el modal como cadenas `||`).
 * La extraemos acá para poder ampliarla y compartirla con plantillas.
 */
const ALIASES: Record<CanonicalColumn, string[]> = {
  customer_name: [
    'customer_name',
    'nombre_cliente',
    'cliente',
    'nombre',
    'nombre_completo',
    'razon_social',
  ],
  customer_code: [
    'customer_code',
    'codigo',
    'codigo_cliente',
    'cod_cliente',
    'cod',
    'code',
    'id_cliente',
    'rut',
  ],
  customer_phone: ['customer_phone', 'telefono', 'phone', 'celular', 'movil'],
  customer_email: ['customer_email', 'email', 'correo', 'mail'],
  address: [
    'address',
    'direccion',
    'dirección',
    'domicilio',
    'calle',
    'customer_address',
  ],
  total_weight_kg: ['total_weight_kg', 'weight_kg', 'peso_kg', 'peso'],
  volume_m3: ['volume_m3', 'volumen_m3', 'volumen'],
  time_window_start: [
    'time_window_start',
    'ventana_inicio',
    'hora_inicio',
    'desde',
    'inicio',
  ],
  time_window_end: ['time_window_end', 'ventana_fin', 'hora_fin', 'hasta', 'fin'],
  requested_date: [
    'requested_date',
    'fecha',
    'fecha_entrega',
    'fecha_solicitada',
    'delivery_date',
  ],
  priority: ['priority', 'prioridad'],
  service_duration_minutes: [
    'service_duration_minutes',
    'duracion_servicio',
    'duracion',
    'tiempo_servicio',
    'service_minutes',
  ],
  internal_notes: [
    'internal_notes',
    'notas',
    'notas_internas',
    'observaciones',
    'items',
    'instrucciones',
    'delivery_instructions',
  ],
  order_number: ['order_number', 'orden', 'n_orden', 'numero_orden', 'numero_pedido', 'n_pedido', 'pedido', 'ref', 'referencia', 'id_pedido'],
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function autoDetectMapping(headers: string[]): MappingConfig {
  const normalizedIndex = new Map<string, string>();
  for (const h of headers) {
    normalizedIndex.set(normalizeHeader(h), h);
  }

  const mapping = emptyMapping();
  for (const col of CANONICAL_COLUMNS) {
    for (const alias of ALIASES[col]) {
      const match = normalizedIndex.get(alias);
      if (match) {
        mapping[col] = match;
        break;
      }
    }
  }
  return mapping;
}

/**
 * Hook: dados los headers del CSV, devuelve un mapping inicial
 * usando los aliases conocidos. Memoizado por identidad del array.
 */
export function useColumnAutoDetect(headers: string[]): MappingConfig {
  return useMemo(() => autoDetectMapping(headers), [headers]);
}
