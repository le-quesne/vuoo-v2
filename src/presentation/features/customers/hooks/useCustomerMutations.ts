import { useState, useCallback } from 'react';
import { customersService } from '@/data/services/customers';
import type { Customer, CustomerInsert, CustomerUpdate } from '../types/customer.types';

export interface UseCustomerMutationsReturn {
  create: (input: CustomerInsert) => Promise<Customer | null>;
  update: (id: string, patch: CustomerUpdate) => Promise<Customer | null>;
  deactivate: (id: string) => Promise<boolean>;
  isPending: boolean;
  error: string | null;
  clearError: () => void;
}

export function useCustomerMutations(): UseCustomerMutationsReturn {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CustomerInsert): Promise<Customer | null> => {
    setIsPending(true);
    setError(null);
    const res = await customersService.create(input);
    setIsPending(false);
    if (!res.success) {
      setError(res.error);
      return null;
    }
    return res.data;
  }, []);

  const update = useCallback(
    async (id: string, patch: CustomerUpdate): Promise<Customer | null> => {
      setIsPending(true);
      setError(null);
      const res = await customersService.update(id, patch);
      setIsPending(false);
      if (!res.success) {
        setError(res.error);
        return null;
      }
      return res.data;
    },
    [],
  );

  const deactivate = useCallback(async (id: string): Promise<boolean> => {
    setIsPending(true);
    setError(null);
    const res = await customersService.deactivate(id);
    setIsPending(false);
    if (!res.success) {
      setError(res.error);
      return false;
    }
    return true;
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { create, update, deactivate, isPending, error, clearError };
}
