import { useEffect, type MutableRefObject } from 'react';
import { supabase } from '@/application/lib/supabase';
import type { LiveLocation, LiveRoute } from '@/domain/entities/liveControl';
import type { DriverLocation, DriverAvailability, RouteStatus } from '@/data/types/database';

interface UseControlRealtimeArgs {
  orgId: string | null;
  date: string;
  routes: LiveRoute[];
  routesRef: MutableRefObject<LiveRoute[]>;
  stationarySinceRef: MutableRefObject<Record<string, number>>;
  knownAlertIdsRef: MutableRefObject<Set<string>>;
  setRoutes: React.Dispatch<React.SetStateAction<LiveRoute[]>>;
  onPlanStopChange: () => void;
}

export function useControlRealtime({
  orgId,
  date,
  routes,
  routesRef,
  stationarySinceRef,
  knownAlertIdsRef,
  setRoutes,
  onPlanStopChange,
}: UseControlRealtimeArgs): void {
  useEffect(() => {
    if (!orgId || routes.length === 0) return;
    const driverIds = routes.map((r) => r.driver?.id).filter((x): x is string => Boolean(x));
    const routeIds = routes.map((r) => r.route_id);

    const channel = supabase
      .channel(`control-${orgId}-${date}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'driver_locations' },
        (payload) => {
          const row = payload.new as DriverLocation | undefined;
          if (!row || !row.driver_id || !driverIds.includes(row.driver_id)) return;
          const route = routesRef.current.find((r) => r.driver?.id === row.driver_id);
          if (route) {
            const speed = row.speed ?? null;
            if (speed !== null && speed === 0) {
              if (!stationarySinceRef.current[route.route_id]) {
                stationarySinceRef.current[route.route_id] = Date.now();
              }
            } else {
              delete stationarySinceRef.current[route.route_id];
              knownAlertIdsRef.current.delete(`stationary-${route.route_id}`);
            }
          }
          setRoutes((prev) =>
            prev.map((r) => {
              if (r.driver?.id !== row.driver_id) return r;
              const next: LiveLocation = {
                lat: row.lat,
                lng: row.lng,
                speed: row.speed ?? null,
                battery: row.battery ?? null,
                recorded_at: row.recorded_at ?? new Date().toISOString(),
              };
              if (r.last_location && r.last_location.recorded_at >= next.recorded_at) return r;
              return { ...r, last_location: next };
            }),
          );
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'plan_stops', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new as
            | { id: string; route_id: string | null; status: string; stop_id: string }
            | undefined;
          if (!row || !row.route_id || !routeIds.includes(row.route_id)) return;
          // Las alerts de stop_completed/failed las genera un trigger SQL (migration 018)
          // y llegan por el canal `alerts-${orgId}`. Aquí solo refrescamos KPIs y rutas.
          onPlanStopChange();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'routes', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = payload.new as { id: string; status: RouteStatus } | undefined;
          if (!row || !routeIds.includes(row.id)) return;
          setRoutes((prev) =>
            prev.map((r) => (r.route_id === row.id ? { ...r, route_status: row.status } : r)),
          );
          onPlanStopChange();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'drivers' },
        (payload) => {
          const row = payload.new as
            | {
                id: string;
                availability?: DriverAvailability;
                availability_updated_at?: string | null;
              }
            | undefined;
          if (!row || !driverIds.includes(row.id)) return;
          if (row.availability === undefined) return;
          setRoutes((prev) =>
            prev.map((r) =>
              r.driver?.id === row.id && r.driver
                ? {
                    ...r,
                    driver: {
                      ...r.driver,
                      availability: row.availability!,
                      availability_updated_at: row.availability_updated_at ?? null,
                    },
                  }
                : r,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, date, routes.length]);
}
