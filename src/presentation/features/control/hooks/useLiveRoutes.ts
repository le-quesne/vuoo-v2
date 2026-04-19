import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLiveRoutes, fetchPlanStopsByRoute } from '@/data/services/control';
import type { LiveRoute } from '@/domain/entities/liveControl';
import type { Stop } from '@/data/types/database';

export interface PlanStopEntry {
  planStopId: string;
  status: string;
  stop: Stop;
}

export type PlanStopsByRoute = Record<string, PlanStopEntry[]>;

export interface UseLiveRoutesReturn {
  routes: LiveRoute[];
  planStopsByRoute: PlanStopsByRoute;
  loading: boolean;
  setRoutes: React.Dispatch<React.SetStateAction<LiveRoute[]>>;
  routesRef: React.MutableRefObject<LiveRoute[]>;
  planStopsRef: React.MutableRefObject<PlanStopsByRoute>;
  refetch: () => Promise<void>;
}

export function useLiveRoutes(
  orgId: string | null,
  date: string,
): UseLiveRoutesReturn {
  const [routes, setRoutes] = useState<LiveRoute[]>([]);
  const [planStopsByRoute, setPlanStopsByRoute] = useState<PlanStopsByRoute>({});
  const [loading, setLoading] = useState(true);

  const routesRef = useRef<LiveRoute[]>([]);
  routesRef.current = routes;
  const planStopsRef = useRef<PlanStopsByRoute>({});
  planStopsRef.current = planStopsByRoute;

  const refetch = useCallback(async () => {
    if (!orgId) return;
    const res = await fetchLiveRoutes(orgId, date);
    if (!res.success) return;
    setRoutes(res.data);

    const routeIds = res.data.map((r) => r.route_id);
    const stopsRes = await fetchPlanStopsByRoute(routeIds);
    if (!stopsRes.success) {
      setPlanStopsByRoute({});
      return;
    }
    const grouped: PlanStopsByRoute = {};
    for (const row of stopsRes.data) {
      if (!grouped[row.route_id]) grouped[row.route_id] = [];
      grouped[row.route_id].push({
        planStopId: row.id,
        status: row.status,
        stop: row.stop,
      });
    }
    setPlanStopsByRoute(grouped);
  }, [orgId, date]);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    void refetch().finally(() => setLoading(false));
  }, [orgId, refetch]);

  return {
    routes,
    planStopsByRoute,
    loading,
    setRoutes,
    routesRef,
    planStopsRef,
    refetch,
  };
}
