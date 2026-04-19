import { useMemo, useState } from 'react';
import { getLiveRouteState, sortLiveRoutes } from '@/domain/adapters/liveControl.adapter';
import type { LiveRoute } from '@/domain/entities/liveControl';

export type ControlFilterKey = 'all' | 'in_transit' | 'problems' | 'offline' | 'completed';

export interface UseRouteFilteringReturn {
  search: string;
  setSearch: (s: string) => void;
  filter: ControlFilterKey;
  setFilter: (f: ControlFilterKey) => void;
  filteredRoutes: LiveRoute[];
}

export function useRouteFiltering(
  routes: LiveRoute[],
  nowMs: number,
): UseRouteFilteringReturn {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ControlFilterKey>('all');

  const filteredRoutes = useMemo(() => {
    const sorted = sortLiveRoutes(routes, nowMs);
    const q = search.trim().toLowerCase();
    return sorted.filter((r) => {
      if (q) {
        const hay = `${r.driver?.name ?? ''} ${r.vehicle?.name ?? ''} ${r.plan_name}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const state = getLiveRouteState(r, nowMs);
      switch (filter) {
        case 'in_transit':
          return state === 'in_transit';
        case 'offline':
          return state === 'offline';
        case 'completed':
          return state === 'completed';
        case 'problems':
          return state === 'offline' || r.stops_failed > 0;
        default:
          return true;
      }
    });
  }, [routes, nowMs, search, filter]);

  return { search, setSearch, filter, setFilter, filteredRoutes };
}
