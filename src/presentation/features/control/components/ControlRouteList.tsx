import { LiveRouteCard } from './LiveRouteCard';
import ContactDriverMenu from './ContactDriverMenu';
import { ROUTE_COLORS } from '@/presentation/components/RouteMap';
import type { LiveRoute } from '@/domain/entities/liveControl';
import type { PlanStopsByRoute } from '../hooks/useLiveRoutes';

interface ControlRouteListProps {
  loading: boolean;
  routes: LiveRoute[];
  filteredRoutes: LiveRoute[];
  planStopsByRoute: PlanStopsByRoute;
  routeColorById: Record<string, string>;
  nowMs: number;
  selectedRouteId: string | null;
  onSelectRoute: (id: string) => void;
  contactRouteId: string | null;
  onOpenContact: (id: string) => void;
  onCloseContact: () => void;
  onReassignStop: (args: { planStopId: string; name: string; routeId: string }) => void;
}

export function ControlRouteList({
  loading,
  routes,
  filteredRoutes,
  planStopsByRoute,
  routeColorById,
  nowMs,
  selectedRouteId,
  onSelectRoute,
  contactRouteId,
  onOpenContact,
  onCloseContact,
  onReassignStop,
}: ControlRouteListProps) {
  if (loading && routes.length === 0) {
    return <div className="text-sm text-gray-400 text-center py-8">Cargando rutas...</div>;
  }
  if (!loading && filteredRoutes.length === 0) {
    return (
      <div className="text-sm text-gray-400 text-center py-8">
        {routes.length === 0 ? 'Sin rutas para este dia.' : 'Sin resultados.'}
      </div>
    );
  }
  return (
    <>
      {filteredRoutes.map((r) => {
        const isSelected = selectedRouteId === r.route_id;
        const pending = (planStopsByRoute[r.route_id] ?? [])
          .filter((e) => e.status === 'pending')
          .map((e) => ({ planStopId: e.planStopId, stop: e.stop }));
        return (
          <div key={r.route_id} className="relative">
            <LiveRouteCard
              route={r}
              color={routeColorById[r.route_id] ?? ROUTE_COLORS[0]}
              nowMs={nowMs}
              selected={isSelected}
              onSelect={() => onSelectRoute(r.route_id)}
              pendingStops={pending}
              onContact={r.driver ? () => onOpenContact(r.route_id) : undefined}
              onReassignStop={(planStopId, name) =>
                onReassignStop({ planStopId, name, routeId: r.route_id })
              }
            />
            {contactRouteId === r.route_id && r.driver && (
              <ContactDriverMenu
                driver={{ id: r.driver.id, name: r.driver.name, phone: r.driver.phone }}
                onClose={onCloseContact}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
