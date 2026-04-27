import type { Order } from '@/domain/entities/order';
import type { Order as OrderRow } from '@/data/types/database';

export function orderFromRow(row: OrderRow): Order {
  return {
    id: row.id,
    orgId: row.org_id,
    orderNumber: row.order_number,
    externalId: row.external_id,
    source: row.source,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    customerCode: row.customer_code,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    deliveryInstructions: row.delivery_instructions,
    items: row.items,
    totalWeightKg: row.total_weight_kg,
    totalVolumeM3: row.total_volume_m3,
    totalPrice: row.total_price,
    currency: row.currency,
    serviceDurationMinutes: row.service_duration_minutes,
    timeWindowStart: row.time_window_start,
    timeWindowEnd: row.time_window_end,
    priority: row.priority,
    requiresSignature: row.requires_signature,
    requiresPhoto: row.requires_photo,
    requestedDate: row.requested_date,
    status: row.status,
    stopId: row.stop_id,
    planStopId: row.plan_stop_id,
    internalNotes: row.internal_notes,
    tags: row.tags,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,

    customerId: row.customer_id ?? null,
    matchQuality: row.match_quality ?? null,
    matchReviewNeeded: row.match_review_needed ?? false,
  };
}
