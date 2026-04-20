import { useCallback, useEffect, useState } from 'react';
import { customersService } from '@/data/services/customers';
import { useAuth } from '@/application/hooks/useAuth';
import type { Customer } from '../types/customer.types';

export interface UseCustomerListReturn {
  customers: Customer[];
  isLoading: boolean;
  error: string | null;
  query: string;
  setQuery: (q: string) => void;
  refetch: () => Promise<void>;
}

export function useCustomerList(): UseCustomerListReturn {
  const { currentOrg } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const refetch = useCallback(async () => {
    if (!currentOrg?.id) {
      setCustomers([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    const res = await customersService.list(currentOrg.id, query || undefined);
    if (!res.success) {
      setError(res.error);
      setCustomers([]);
    } else {
      setCustomers(res.data);
    }
    setIsLoading(false);
  }, [currentOrg?.id, query]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { customers, isLoading, error, query, setQuery, refetch };
}
