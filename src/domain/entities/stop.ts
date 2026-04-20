// Entidad de dominio Stop (cache normalizada de ubicaciones).
// TODO: regenerar database.ts cuando la migración de Fase A (PRD 12) se aplique.

export type StopServiceType = 'delivery' | 'pickup' | 'both';

export interface Stop {
  id: string;
  orgId: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  durationMinutes: number;
  weightKg: number | null;
  volumeM3: number | null;
  timeWindowStart: string | null;
  timeWindowEnd: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  deliveryInstructions: string | null;
  createdAt: string;

  // Fase A (PRD 12)
  customerId: string | null;
  addressHash: string | null;
  geocodingConfidence: number | null;
  geocodingProvider: string | null;
  isCurated: boolean;
  priority: number;
  requiredSkills: string[];
  serviceType: StopServiceType;
  lastUsedAt: string | null;
  useCount: number;
}
