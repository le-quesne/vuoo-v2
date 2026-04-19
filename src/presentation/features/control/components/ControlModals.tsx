import BroadcastModal from './BroadcastModal';
import IncidentModal from './IncidentModal';
import { ReassignStopModal } from './ReassignStopModal';
import type { LiveRoute } from '@/domain/entities/liveControl';

export interface ReassignTarget {
  planStopId: string;
  name: string;
  routeId: string;
}

interface ControlModalsProps {
  orgId: string | null;
  userId: string | null;
  routes: LiveRoute[];
  selectedRouteId: string | null;
  showBroadcast: boolean;
  onCloseBroadcast: () => void;
  showIncident: boolean;
  onCloseIncident: () => void;
  reassignTarget: ReassignTarget | null;
  onCloseReassign: () => void;
  onReassigned: () => void;
}

export function ControlModals({
  orgId,
  userId,
  routes,
  selectedRouteId,
  showBroadcast,
  onCloseBroadcast,
  showIncident,
  onCloseIncident,
  reassignTarget,
  onCloseReassign,
  onReassigned,
}: ControlModalsProps) {
  return (
    <>
      {showBroadcast && (
        <BroadcastModal
          routes={routes}
          onClose={onCloseBroadcast}
          onSent={onCloseBroadcast}
        />
      )}

      {showIncident && orgId && userId && (
        <IncidentModal
          orgId={orgId}
          userId={userId}
          routes={routes}
          preselectedRouteId={selectedRouteId}
          onClose={onCloseIncident}
          onSaved={onCloseIncident}
        />
      )}

      {reassignTarget && (() => {
        const current = routes.find((r) => r.route_id === reassignTarget.routeId);
        const candidates = routes
          .filter((r) => r.route_id !== reassignTarget.routeId)
          .map((r) => ({
            route_id: r.route_id,
            driver: r.driver ? { id: r.driver.id, name: r.driver.name } : null,
            stops_total: r.stops_total,
            stops_completed: r.stops_completed,
          }));
        return (
          <ReassignStopModal
            planStopId={reassignTarget.planStopId}
            planStopName={reassignTarget.name}
            currentRouteId={reassignTarget.routeId}
            currentDriverId={current?.driver?.id ?? null}
            candidateRoutes={candidates}
            onClose={onCloseReassign}
            onReassigned={() => {
              onCloseReassign();
              onReassigned();
            }}
          />
        );
      })()}
    </>
  );
}
