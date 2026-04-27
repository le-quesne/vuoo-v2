import type { Order, OrderItem, OrderPriority } from '@/data/types/database';

export interface OrderFormState {
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  address: string;
  delivery_instructions: string;
  items: OrderItem[];
  service_duration_minutes: number;
  time_window_start: string;
  time_window_end: string;
  requested_date: string;
  priority: OrderPriority;
  requires_signature: boolean;
  requires_photo: boolean;
  internal_notes: string;
  tags: string[];
}

export function emptyForm(): OrderFormState {
  return {
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    address: '',
    delivery_instructions: '',
    items: [],
    service_duration_minutes: 15,
    time_window_start: '',
    time_window_end: '',
    requested_date: new Date().toISOString().slice(0, 10),
    priority: 'normal',
    requires_signature: false,
    requires_photo: true,
    internal_notes: '',
    tags: [],
  };
}

export function fromOrder(o: Order): OrderFormState {
  return {
    customer_name: o.customer_name,
    customer_phone: o.customer_phone ?? '',
    customer_email: o.customer_email ?? '',
    address: o.address ?? '',
    delivery_instructions: o.delivery_instructions ?? '',
    items: o.items ?? [],
    service_duration_minutes: o.service_duration_minutes,
    time_window_start: o.time_window_start?.slice(0, 5) ?? '',
    time_window_end: o.time_window_end?.slice(0, 5) ?? '',
    requested_date: o.requested_date ?? '',
    priority: o.priority,
    requires_signature: o.requires_signature,
    requires_photo: o.requires_photo,
    internal_notes: o.internal_notes ?? '',
    tags: o.tags ?? [],
  };
}

export function totalWeight(items: OrderItem[]): number {
  return items.reduce((sum, it) => sum + (it.weight_kg ?? 0) * it.quantity, 0);
}
