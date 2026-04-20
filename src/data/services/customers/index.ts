export * as customersService from './customers.services';
export * from './customers.types';
// Re-export explícito para callers que importan tipos compartidos con orders
// (ej. reporte de import de customers CSV).
export type { ImportReport } from '@/data/services/orders/orders.types';
