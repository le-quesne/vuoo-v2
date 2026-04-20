// Entidad de dominio Vehicle.
// TODO: regenerar database.ts cuando la migración de Fase A (PRD 12) se aplique.

import type { FuelType } from '@/data/types/database';

export interface Vehicle {
  id: string;
  orgId: string;
  userId: string;
  name: string;
  licensePlate: string | null;
  brand: string | null;
  model: string | null;
  capacityWeightKg: number;
  capacityVolumeM3: number | null;
  pricePerKm: number | null;
  pricePerHour: number | null;
  fuelType: FuelType;
  avgConsumption: number | null;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  depotLat: number | null;
  depotLng: number | null;
  depotAddress: string | null;
  createdAt: string;

  // Fase A (PRD 12)
  skills: string[];
  volumeM3: number | null;
  maxStops: number | null;
}
