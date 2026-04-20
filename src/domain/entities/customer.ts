// Entidad de dominio Customer (B2B opcional).
// TODO: regenerar database.ts cuando la migración de Fase A (PRD 12) se aplique.

export interface Customer {
  id: string;
  orgId: string;
  customerCode: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  defaultTimeWindowStart: string | null; // HH:MM:SS
  defaultTimeWindowEnd: string | null;
  defaultServiceMinutes: number;
  defaultRequiredSkills: string[];
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
