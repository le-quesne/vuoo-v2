// Re-exports desde el servicio + tipos UI-específicos de la feature customers.
// El servicio `@/data/services/customers` lo crea un agente paralelo; mantenemos
// los nombres consistentes con el PRD 12 §3 Fase A.2.
import type {
  Customer,
  CustomerInsert,
  CustomerUpdate,
  ImportReport,
} from '@/data/services/customers';
import type { Stop, Order } from '@/data/types/database';

export type { Customer, CustomerInsert, CustomerUpdate, ImportReport };

export interface CustomerFormValues {
  customer_code: string;
  name: string;
  email: string;
  phone: string;
  default_time_window_start: string;
  default_time_window_end: string;
  default_service_minutes: number;
  default_required_skills: string[];
  notes: string;
  is_active: boolean;
}

export interface CustomerDetailData {
  customer: Customer;
  stops: Stop[];
  recentOrders: Order[];
}
