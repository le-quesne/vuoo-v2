// Tipos para la tabla customers (PRD 12, Fase A).
// TODO: regenerar database.ts cuando la migración se aplique y tipar desde allí.

export interface CustomerRow {
  id: string;
  org_id: string;
  customer_code: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  default_time_window_start: string | null;
  default_time_window_end: string | null;
  default_service_minutes: number;
  default_required_skills: string[];
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerInsert {
  id?: string;
  org_id: string;
  customer_code?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  default_time_window_start?: string | null;
  default_time_window_end?: string | null;
  default_service_minutes?: number;
  default_required_skills?: string[];
  notes?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export type CustomerUpdate = Partial<Omit<CustomerInsert, 'org_id'>>;

/**
 * Alias conveniente para consumidores que trabajan con el row "crudo" tipo DB.
 * La entidad de dominio camelCase vive en `@/domain/entities/customer`.
 */
export type Customer = CustomerRow;
