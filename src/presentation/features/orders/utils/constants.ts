import type { OrderPriority, OrderSource, OrderStatus } from '@/data/types/database';

export const PAGE_SIZE = 25;

export type StatusFilter = 'all' | OrderStatus;

export interface StatusMeta {
  label: string;
  classes: string;
  dot: string;
}

export const STATUS_META: Record<OrderStatus, StatusMeta> = {
  pending:    { label: 'Pendiente',  classes: 'bg-amber-50 text-amber-700 border-amber-200',    dot: 'bg-amber-400' },
  scheduled:  { label: 'Programado', classes: 'bg-blue-50 text-blue-700 border-blue-200',       dot: 'bg-blue-400' },
  in_transit: { label: 'En ruta',    classes: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: 'bg-indigo-400' },
  delivered:  { label: 'Entregado',  classes: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-400' },
  failed:     { label: 'Fallido',    classes: 'bg-red-50 text-red-700 border-red-200',           dot: 'bg-red-400' },
  cancelled:  { label: 'Cancelado',  classes: 'bg-gray-100 text-gray-600 border-gray-200',       dot: 'bg-gray-400' },
  returned:   { label: 'Devuelto',   classes: 'bg-orange-50 text-orange-700 border-orange-200',  dot: 'bg-orange-400' },
};

export const SOURCE_LABEL: Record<OrderSource, string> = {
  manual:   'Manual',
  csv:      'CSV',
  shopify:  'Shopify',
  vtex:     'VTEX',
  api:      'API',
  whatsapp: 'WhatsApp',
};

export const PRIORITY_LABEL: Record<OrderPriority, string> = {
  urgent: 'Urgente',
  high:   'Alta',
  normal: 'Normal',
  low:    'Baja',
};
