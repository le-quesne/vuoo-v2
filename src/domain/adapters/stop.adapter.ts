import type { Stop } from '@/domain/entities/stop';
import type { Stop as StopRow } from '@/data/types/database';

export function stopFromRow(row: StopRow): Stop {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    durationMinutes: row.duration_minutes,
    weightKg: row.weight_kg,
    volumeM3: row.volume_m3,
    timeWindowStart: row.time_window_start,
    timeWindowEnd: row.time_window_end,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    deliveryInstructions: row.delivery_instructions,
    createdAt: row.created_at,

    customerId: row.customer_id ?? null,
    addressHash: row.address_hash ?? null,
    geocodingConfidence: row.geocoding_confidence ?? null,
    geocodingProvider: row.geocoding_provider ?? null,
    isCurated: row.is_curated ?? false,
    priority: row.priority ?? 0,
    requiredSkills: row.required_skills ?? [],
    serviceType: row.service_type ?? 'delivery',
    lastUsedAt: row.last_used_at ?? null,
    useCount: row.use_count ?? 0,
  };
}
