// Tipos para el servicio de orders.
// TODO: regenerar database.ts cuando la migración de Fase A (PRD 12) se aplique
// para obtener OrderInsert/OrderUpdate tipados desde Database['public']['Tables']['orders'].

import type {
  Order,
  OrderItem,
  OrderPriority,
  OrderSource,
  OrderStatus,
} from '@/data/types/database';

export type MatchQuality = 'high' | 'medium' | 'low' | 'none';

export interface OrderInsert {
  id?: string;
  org_id: string;
  order_number: string;
  external_id?: string | null;
  source: OrderSource;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  address: string;
  lat?: number | null;
  lng?: number | null;
  delivery_instructions?: string | null;
  items: OrderItem[];
  total_weight_kg?: number;
  total_volume_m3?: number | null;
  total_price?: number | null;
  currency?: string;
  service_duration_minutes?: number;
  time_window_start?: string | null;
  time_window_end?: string | null;
  priority?: OrderPriority;
  requires_signature?: boolean;
  requires_photo?: boolean;
  requested_date?: string | null;
  status?: OrderStatus;
  stop_id?: string | null;
  plan_stop_id?: string | null;
  internal_notes?: string | null;
  tags?: string[];
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;

  // Fase A (PRD 12)
  customer_id?: string | null;
  match_quality?: MatchQuality | null;
  match_review_needed?: boolean;
}

export type OrderUpdate = Partial<Omit<OrderInsert, 'org_id'>>;

export interface ImportMatchStats {
  high: number;
  medium: number;
  low: number;
  none: number;
  created: number;
}

export interface ImportReport {
  created: number;
  failed: number;
  warnings: string[];
  orderIds: string[];
  matchStats: ImportMatchStats;
  durationMs?: number;
}

export type AssignAction =
  | 'merged_existing'
  | 'created_new'
  | 'skipped_already_assigned';

export interface AssignEntry {
  order_id: string;
  stop_id: string;
  plan_stop_id: string;
  action: AssignAction;
  match_quality: MatchQuality | null;
}

export interface AssignReport {
  entries: AssignEntry[];
  mergedCount: number;
  createdCount: number;
  skippedCount: number;
}

// Re-export para consumidores externos del servicio.
export type { Order };
