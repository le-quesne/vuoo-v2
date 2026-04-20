// Tipos mínimos del contrato Vroom entre el frontend y el backend Railway.
// El backend hace el mapeo exacto al contrato de Vroom; en el frontend
// trabajamos con la forma que devuelve/acepta el endpoint `/vroom/optimize`.

export type VroomMode =
  | 'efficiency'
  | 'balance_stops'
  | 'balance_time'
  | 'consolidate';

export interface VroomRequest {
  plan_id: string;
  mode: VroomMode;
  return_to_depot: boolean;
  /** Opcional: restringir la optimización a estos vehículos. */
  vehicle_ids?: string[];
}

export interface VroomRoute {
  route_id: string;
  vehicle_id: string;
  total_duration: number;
  total_distance: number | null;
  ordered_plan_stop_ids: string[];
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
