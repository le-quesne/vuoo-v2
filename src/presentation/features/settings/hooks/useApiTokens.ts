import { useCallback, useEffect, useState } from 'react';
import {
  list as listTokens,
  create as createToken,
  revoke as revokeToken,
} from '@/data/services/apiTokens';
import type {
  ApiTokenCreateInput,
  ApiTokenCreateResult,
  ApiTokenRow,
} from '@/data/services/apiTokens';

export interface UseApiTokensReturn {
  tokens: ApiTokenRow[];
  isLoading: boolean;
  error: string | null;
  /** Último token creado (solo vive en memoria hasta que el usuario cierre el modal). */
  lastCreated: ApiTokenCreateResult | null;
  create: (
    input: Omit<ApiTokenCreateInput, 'orgId'>,
  ) => Promise<ApiTokenCreateResult | null>;
  revoke: (id: string) => Promise<boolean>;
  refetch: () => Promise<void>;
  clearLastCreated: () => void;
}

export function useApiTokens(orgId: string | undefined): UseApiTokensReturn {
  const [tokens, setTokens] = useState<ApiTokenRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<ApiTokenCreateResult | null>(null);

  const refetch = useCallback(async () => {
    if (!orgId) return;
    setIsLoading(true);
    setError(null);
    const res = await listTokens(orgId);
    if (!res.success) setError(res.error);
    else setTokens(res.data);
    setIsLoading(false);
  }, [orgId]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const create = useCallback(
    async (
      input: Omit<ApiTokenCreateInput, 'orgId'>,
    ): Promise<ApiTokenCreateResult | null> => {
      if (!orgId) {
        setError('No hay organización activa.');
        return null;
      }
      setError(null);
      const res = await createToken({ ...input, orgId });
      if (!res.success) {
        setError(res.error);
        return null;
      }
      setLastCreated(res.data);
      setTokens((prev) => [res.data.token, ...prev]);
      return res.data;
    },
    [orgId],
  );

  const revoke = useCallback(async (id: string): Promise<boolean> => {
    setError(null);
    const res = await revokeToken(id);
    if (!res.success) {
      setError(res.error);
      return false;
    }
    const nowIso = new Date().toISOString();
    setTokens((prev) =>
      prev.map((t) => (t.id === id ? { ...t, revoked_at: nowIso } : t)),
    );
    return true;
  }, []);

  const clearLastCreated = useCallback(() => setLastCreated(null), []);

  return {
    tokens,
    isLoading,
    error,
    lastCreated,
    create,
    revoke,
    refetch,
    clearLastCreated,
  };
}
