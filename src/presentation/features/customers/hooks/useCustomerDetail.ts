import { useCallback, useEffect, useState } from 'react';
import { customersService } from '@/data/services/customers';
import { stopsService } from '@/data/services/stops';
import { ordersService } from '@/data/services/orders';
import { useAuth } from '@/application/hooks/useAuth';
import type { Customer } from '../types/customer.types';
import type { Stop, Order } from '@/data/types/database';

export interface UseCustomerDetailReturn {
  customer: Customer | null;
  stops: Stop[];
  recentOrders: Order[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const RECENT_ORDERS_LIMIT = 20;

export function useCustomerDetail(customerId: string | null): UseCustomerDetailReturn {
  const { currentOrg } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!customerId || !currentOrg?.id) {
      setCustomer(null);
      setStops([]);
      setRecentOrders([]);
      return;
    }
    setIsLoading(true);
    setError(null);

    const customerRes = await customersService.getById(customerId);
    if (!customerRes.success) {
      setError(customerRes.error);
      setIsLoading(false);
      return;
    }
    setCustomer(customerRes.data);

    // Stops filtrados por customer_id (columna añadida en Fase A, PRD 12).
    const stopsRes = await stopsService.listByCustomer(currentOrg.id, customerId);
    if (stopsRes.success) {
      setStops(stopsRes.data);
    }

    const ordersRes = await ordersService.listOrders({
      orgId: currentOrg.id,
      from: 0,
      to: RECENT_ORDERS_LIMIT - 1,
    });
    if (ordersRes.success) {
      setRecentOrders(
        ordersRes.data.items.filter(
          (o) => (o as Order & { customer_id?: string | null }).customer_id === customerId,
        ),
      );
    }

    setIsLoading(false);
  }, [customerId, currentOrg?.id]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { customer, stops, recentOrders, isLoading, error, refetch };
}
