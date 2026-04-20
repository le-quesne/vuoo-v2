// Entidad de dominio Order.
// TODO: regenerar database.ts cuando la migración de Fase A (PRD 12) se aplique.

import type {
  OrderItem,
  OrderPriority,
  OrderSource,
  OrderStatus,
} from '@/data/types/database';

export type MatchQuality = 'high' | 'medium' | 'low' | 'none';

export interface Order {
  id: string;
  orgId: string;
  orderNumber: string;
  externalId: string | null;
  source: OrderSource;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  deliveryInstructions: string | null;
  items: OrderItem[];
  totalWeightKg: number;
  totalVolumeM3: number | null;
  totalPrice: number | null;
  currency: string;
  serviceDurationMinutes: number;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  priority: OrderPriority;
  requiresSignature: boolean;
  requiresPhoto: boolean;
  requestedDate: string | null;
  status: OrderStatus;
  stopId: string | null;
  planStopId: string | null;
  internalNotes: string | null;
  tags: string[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;

  // Fase A (PRD 12)
  customerId: string | null;
  matchQuality: MatchQuality | null;
  matchReviewNeeded: boolean;
}
