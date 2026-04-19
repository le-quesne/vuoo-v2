import type { PlanStopWithStop } from '@/data/types/database';

export function routePlannedKm(
  route: { id: string; total_distance_km: number | null },
  fetched: Record<string, number>,
): number {
  if (route.total_distance_km && route.total_distance_km > 0) return route.total_distance_km;
  return fetched[route.id] ?? 0;
}

export function routeTraveledKm(
  route: { id: string; total_distance_km: number | null; planStops: PlanStopWithStop[] },
  fetched: Record<string, number>,
): number {
  const total = routePlannedKm(route, fetched);
  const stops = route.planStops.length;
  if (stops === 0 || total === 0) return 0;
  const completed = route.planStops.filter((ps) => ps.status === 'completed').length;
  return (completed / stops) * total;
}
