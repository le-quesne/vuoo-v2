import type { Order, OrderStatus } from '@/data/types/database';

export function formatOrderDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
}

export function statusCounts(orders: Order[]): Record<OrderStatus, number> {
  const counts: Record<OrderStatus, number> = {
    pending: 0,
    scheduled: 0,
    in_transit: 0,
    delivered: 0,
    failed: 0,
    cancelled: 0,
    returned: 0,
  };
  for (const o of orders) counts[o.status] += 1;
  return counts;
}
