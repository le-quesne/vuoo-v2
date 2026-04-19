import { useCallback, useEffect, useState } from 'react';
import { fetchLiveDashboard } from '@/data/services/control';
import { DASHBOARD_POLL_MS } from '@/presentation/features/control/constants';
import type { LiveDashboard } from '@/domain/entities/liveControl';

export interface UseLiveDashboardReturn {
  dashboard: LiveDashboard | null;
  refetch: () => Promise<void>;
}

export function useLiveDashboard(
  orgId: string | null,
  date: string,
): UseLiveDashboardReturn {
  const [dashboard, setDashboard] = useState<LiveDashboard | null>(null);

  const refetch = useCallback(async () => {
    if (!orgId) return;
    const res = await fetchLiveDashboard(orgId, date);
    if (res.success) setDashboard(res.data);
  }, [orgId, date]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!orgId) return;
    const id = setInterval(() => {
      void refetch();
    }, DASHBOARD_POLL_MS);
    return () => clearInterval(id);
  }, [orgId, refetch]);

  return { dashboard, refetch };
}
