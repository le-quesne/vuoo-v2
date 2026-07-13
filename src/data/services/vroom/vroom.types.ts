// Tipos mínimos del contrato Vroom entre el frontend y el backend Railway.
// El backend hace el mapeo exacto al contrato de Vroom; en el frontend
// trabajamos con la forma que devuelve/acepta el endpoint `/vroom/optimize`.

import type { OptimizationMode } from '@/data/types/database';

/** Alias — mismo union que OptimizationMode en database.ts. */
export type VroomMode = OptimizationMode;

/**
 * Pesos 0–1 para la matriz de costo ponderada (PRD 26 Fase 2, beta). Si se
 * mandan, el backend ignora `mode` por completo y arma su propia matriz de
 * costo (tiempo + distancia + afinidad histórica) en vez de usar los 5
 * presets. No hace falta que sumen 1 — cada uno pondera su propio término.
 */
export interface VroomWeights {
  time?: number;
  distance?: number;
  history?: number;
}

export interface VroomRequest {
  plan_id: string;
  mode: VroomMode;
  return_to_depot: boolean;
  /** Opcional: restringir la optimización a estos vehículos. */
  vehicle_ids?: string[];
  /**
   * Opcional (PRD 25 — multi-depot): depot a usar como fallback para
   * vehículos que no tengan su propio `vehicles.depot_id`/`depot_lat/lng`.
   */
  depot_id?: string;
  /** Opcional (beta): activa la matriz de costo ponderada en vez de `mode`. */
  weights?: VroomWeights;
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
