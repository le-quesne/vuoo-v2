import { useCallback, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { useAuth } from '@/application/hooks/useAuth';
import { RouteMap, ROUTE_COLORS } from '@/presentation/components/RouteMap';
import { isAlertSoundMuted, setAlertSoundMuted } from '@/application/lib/alertSound';
import type { DriverLocation } from '@/data/types/database';
import {
  AlertToastStack,
  ControlAlertsPopover,
  ControlFilters,
  ControlHeader,
  ControlModals,
  ControlRouteList,
  KpiBar,
  type ReassignTarget,
} from '@/presentation/features/control/components';
import {
  useAlertFeed,
  useControlPresence,
  useControlRealtime,
  useDerivedAlerts,
  useLiveDashboard,
  useLiveRoutes,
  useNowTick,
  useOrgDepot,
  useRouteFiltering,
} from '@/presentation/features/control/hooks';

export function ControlPage() {
  const { currentOrg, user } = useAuth();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const orgId = currentOrg?.id ?? null;

  const nowMs = useNowTick();
  const orgDepot = useOrgDepot(orgId);
  const { dashboard, refetch: refetchDashboard } = useLiveDashboard(orgId, dateStr);
  const {
    routes,
    planStopsByRoute,
    loading,
    setRoutes,
    routesRef,
    planStopsRef,
    refetch: refetchRoutes,
  } = useLiveRoutes(orgId, dateStr);
  const {
    alerts,
    toastQueue,
    knownAlertIdsRef,
    pushAlerts,
    acknowledge,
    dismissToast,
    highUnackedCount,
  } = useAlertFeed(orgId, user?.id ?? null);
  const presentUsers = useControlPresence(orgId, user?.id ?? null, user?.email ?? null);

  const stationarySinceRef = useRef<Record<string, number>>({});

  const refreshAll = useCallback(() => {
    void refetchRoutes();
    void refetchDashboard();
  }, [refetchRoutes, refetchDashboard]);

  useControlRealtime({
    orgId,
    date: dateStr,
    routes,
    routesRef,
    stationarySinceRef,
    knownAlertIdsRef,
    setRoutes,
    onPlanStopChange: refreshAll,
  });

  useDerivedAlerts({
    orgId,
    date: dateStr,
    routesRef,
    planStopsRef,
    stationarySinceRef,
    pushAlerts,
  });

  const { search, setSearch, filter, setFilter, filteredRoutes } = useRouteFiltering(
    routes,
    nowMs,
  );

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [muted, setMuted] = useState<boolean>(() => isAlertSoundMuted());
  const [showAlerts, setShowAlerts] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [showIncident, setShowIncident] = useState(false);
  const [contactRouteId, setContactRouteId] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<ReassignTarget | null>(null);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      setAlertSoundMuted(next);
      return next;
    });
  }, []);

  const routeColorById = useMemo(() => {
    const map: Record<string, string> = {};
    routes.forEach((r, i) => {
      map[r.route_id] = ROUTE_COLORS[i % ROUTE_COLORS.length];
    });
    return map;
  }, [routes]);

  const mapRouteGroups = useMemo(
    () =>
      routes.map((r) => ({
        routeId: r.route_id,
        vehicleName: r.vehicle?.name ?? 'Sin vehiculo',
        stops: (planStopsByRoute[r.route_id] ?? []).map((e) => e.stop),
        color: routeColorById[r.route_id] ?? ROUTE_COLORS[0],
      })),
    [routes, planStopsByRoute, routeColorById],
  );

  const mapDriverLocations = useMemo<DriverLocation[]>(() => {
    const now = new Date().toISOString();
    const result: DriverLocation[] = [];
    for (const r of routes) {
      if (!r.last_location || !r.driver) continue;
      result.push({
        id: `${r.route_id}-loc`,
        driver_id: r.driver.id,
        route_id: r.route_id,
        lat: r.last_location.lat,
        lng: r.last_location.lng,
        speed: r.last_location.speed,
        battery: r.last_location.battery,
        heading: null,
        recorded_at: r.last_location.recorded_at,
        created_at: r.last_location.recorded_at ?? now,
        org_id: orgId ?? '',
      });
    }
    return result;
  }, [routes, orgId]);

  const driverNameByRouteId = useMemo(() => {
    const m: Record<string, string> = {};
    routes.forEach((r) => {
      m[r.route_id] = r.driver?.name ?? r.vehicle?.name ?? 'Conductor';
    });
    return m;
  }, [routes]);

  const handleSelectRoute = useCallback((id: string) => {
    setSelectedRouteId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="flex flex-col h-screen">
      <ControlHeader
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        muted={muted}
        onToggleMute={toggleMute}
        highUnackedCount={highUnackedCount}
        showAlerts={showAlerts}
        onToggleAlerts={() => setShowAlerts((v) => !v)}
        presentUsers={presentUsers}
        currentUserId={user?.id}
        onOpenBroadcast={() => setShowBroadcast(true)}
        onOpenIncident={() => setShowIncident(true)}
      />

      <div className="relative">
        <ControlAlertsPopover
          open={showAlerts}
          onClose={() => setShowAlerts(false)}
          alerts={alerts}
          nowMs={nowMs}
          onAcknowledge={acknowledge}
          onSelectRoute={setSelectedRouteId}
        />
      </div>

      <div className="px-6 py-2 border-b border-gray-100 bg-gray-50/50">
        <KpiBar dashboard={dashboard} loading={loading} />
      </div>

      <div className="flex-1 flex px-6 py-3 gap-3 min-h-0">
        <div className="w-[360px] flex flex-col gap-2 min-h-0">
          <ControlFilters
            search={search}
            onSearchChange={setSearch}
            filter={filter}
            onFilterChange={setFilter}
          />
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
            <ControlRouteList
              loading={loading}
              routes={routes}
              filteredRoutes={filteredRoutes}
              planStopsByRoute={planStopsByRoute}
              routeColorById={routeColorById}
              nowMs={nowMs}
              selectedRouteId={selectedRouteId}
              onSelectRoute={handleSelectRoute}
              contactRouteId={contactRouteId}
              onOpenContact={setContactRouteId}
              onCloseContact={() => setContactRouteId(null)}
              onReassignStop={setReassignTarget}
            />
          </div>
        </div>

        <div className="flex-1 rounded-lg overflow-hidden border border-gray-200 min-h-0">
          <RouteMap
            routeGroups={mapRouteGroups}
            driverLocations={mapDriverLocations}
            driverColorByRouteId={routeColorById}
            driverNameByRouteId={driverNameByRouteId}
            selectedRouteId={selectedRouteId}
            depot={orgDepot}
          />
        </div>
      </div>

      <AlertToastStack alerts={toastQueue} onDismiss={dismissToast} />

      <ControlModals
        orgId={orgId}
        userId={user?.id ?? null}
        routes={routes}
        selectedRouteId={selectedRouteId}
        showBroadcast={showBroadcast}
        onCloseBroadcast={() => setShowBroadcast(false)}
        showIncident={showIncident}
        onCloseIncident={() => setShowIncident(false)}
        reassignTarget={reassignTarget}
        onCloseReassign={() => setReassignTarget(null)}
        onReassigned={refreshAll}
      />
    </div>
  );
}
