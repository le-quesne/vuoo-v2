import type { Customer } from '@/domain/entities/customer';
import type { CustomerRow } from '@/data/services/customers/customers.types';

export function customerFromRow(row: CustomerRow): Customer {
  return {
    id: row.id,
    orgId: row.org_id,
    customerCode: row.customer_code ?? null,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    defaultTimeWindowStart: row.default_time_window_start ?? null,
    defaultTimeWindowEnd: row.default_time_window_end ?? null,
    defaultServiceMinutes: row.default_service_minutes ?? 5,
    defaultRequiredSkills: row.default_required_skills ?? [],
    notes: row.notes ?? null,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
