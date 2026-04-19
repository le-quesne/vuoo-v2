import { useEffect, type MutableRefObject } from 'react';
import { derivedAlertsFromRoutes } from '@/domain/adapters/liveControl.adapter';
import { DERIVED_ALERT_MS } from '@/presentation/features/control/constants';
import type { LiveAlert, LiveRoute, PendingStopInfo } from '@/domain/entities/liveControl';
import type { PlanStopsByRoute } from './useLiveRoutes';

interface UseDerivedAlertsArgs {
  orgId: string | null;
  date: string;
  routesRef: MutableRefObject<LiveRoute[]>;
  planStopsRef: MutableRefObject<PlanStopsByRoute>;
  stationarySinceRef: MutableRefObject<Record<string, number>>;
  pushAlerts: (alerts: LiveAlert[]) => void;
}

export function useDerivedAlerts({
  orgId,
  date,
  routesRef,
  planStopsRef,
  stationarySinceRef,
  pushAlerts,
}: UseDerivedAlertsArgs): void {
  useEffect(() => {
    function tick() {
      const pendingStops: PendingStopInfo[] = [];
      for (const [routeId, entries] of Object.entries(planStopsRef.current)) {
        for (const e of entries) {
          if (e.status !== 'pending') continue;
          if (!e.stop.time_window_end) continue;
          pendingStops.push({
            planStopId: e.planStopId,
            routeId,
            name: e.stop.name,
            timeWindowEnd: e.stop.time_window_end,
          });
        }
      }
      const derived = derivedAlertsFromRoutes(routesRef.current, Date.now(), {
        pendingStops,
        stationarySince: stationarySinceRef.current,
      });
      if (derived.length > 0) pushAlerts(derived);
    }
    tick();
    const id = setInterval(tick, DERIVED_ALERT_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, date]);
}
