import type { Vehicle } from '@/domain/entities/vehicle';
import type { Vehicle as VehicleRow } from '@/data/types/database';

export function vehicleFromRow(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    name: row.name,
    licensePlate: row.license_plate,
    brand: row.brand,
    model: row.model,
    capacityWeightKg: row.capacity_weight_kg,
    capacityVolumeM3: row.capacity_volume_m3,
    pricePerKm: row.price_per_km,
    pricePerHour: row.price_per_hour,
    fuelType: row.fuel_type,
    avgConsumption: row.avg_consumption,
    timeWindowStart: row.time_window_start,
    timeWindowEnd: row.time_window_end,
    depotLat: row.depot_lat,
    depotLng: row.depot_lng,
    depotAddress: row.depot_address,
    createdAt: row.created_at,

    skills: row.skills,
    volumeM3: row.volume_m3,
    maxStops: row.max_stops,
  };
}
