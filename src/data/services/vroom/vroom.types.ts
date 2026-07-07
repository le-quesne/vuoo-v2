// Tipos mínimos del contrato Vroom entre el frontend y el backend Railway.
// El backend hace el mapeo exacto al contrato de Vroom; en el frontend
// trabajamos con la forma que devuelve/acepta el endpoint `/vroom/optimize`.

import type { OptimizationMode } from '@/data/types/database';

/** Alias — mismo union que OptimizationMode en database.ts. */
export type VroomMode = OptimizationMode;

export interface VroomRequest {
  plan_id: string;
  mode: VroomMode;
  return_to_depot: boolean;
  /** Opcional: restringir la optimización a estos vehículos. */
  vehicle_ids?: string[];
  /**
   * Opcional (PRD 25 — multi-depot): depot a usar como fallback para
   * vehículos que no tengan su propio `vehicles.depot_id`/`depot_lat/lng`.
   * Sin esto, se sigue usando `organizations.default_depot_*` como siempre.
   */
  depot_id?: string;
}

export interface VroomRoute {
  route_id: string;
  vehicle_id: string;
  total_duration: number;
  total_distance: number | null;
  ordered_plan_stop_ids: string[];
  /** Polilínea optimizada como array [[lng,lat], ...]. Null si Vroom no devolvió geometría. */
  geometry: [number, number][] | null;
}

export interface VroomUnassigned {
  plan_stop_id: string | null;
  reason: string;
}

export interface VroomSummary {
  cost: number;
  routes: number;
  unassigned: number;
  duration: number;
}

export interface VroomResponse {
  summary: VroomSummary;
  routes: VroomRoute[];
  unassigned: VroomUnassigned[];
}
