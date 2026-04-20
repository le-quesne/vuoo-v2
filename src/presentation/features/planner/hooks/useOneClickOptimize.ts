import { useCallback, useState } from 'react';
import { supabase } from '@/application/lib/supabase';
import { optimize as optimizeVroom } from '@/data/services/vroom';
import type { ServiceResult } from '@/data/services/_shared/response';
import type { Plan, Vehicle } from '@/data/types/database';

/**
 * Shape that Vroom (Railway) returns after optimizing a plan.
 * Kept in sync with VroomWizardModal's local type — eventually este tipo
 * debería vivir en `@/data/services/vroom/vroom.types.ts`.
 */
export interface VroomPreview {
  summary: { cost: number; routes: number; unassigned: number; duration: number };
  routes: Array<{
    route_id: string;
    vehicle_id: string;
    total_duration: number;
    total_distance: number | null;
    ordered_plan_stop_ids: string[];
  }>;
  unassigned: Array<{ plan_stop_id: string | null; reason: string }>;
}

export interface OneClickOptimizeResult {
  plan: Plan;
  selectedVehicleIds: string[];
  assignReport: {
    created: number;
    merged: number;
    skipped: number;
  };
  preview: VroomPreview;
}

export interface UseOneClickOptimizeReturn {
  execute: (date: string) => Promise<ServiceResult<OneClickOptimizeResult>>;
  isRunning: boolean;
  error: string | null;
  result: OneClickOptimizeResult | null;
  reset: () => void;
}

type OptimizeMode = 'efficiency' | 'balance_stops' | 'balance_time' | 'consolidate';

interface OneClickOptimizeOptions {
  mode?: OptimizeMode;
  returnToDepot?: boolean;
}

/**
 * One-click "optimize day" flow (Fase D.1 del PRD 12).
 *
 * Pipeline:
 *  1. Encuentra/crea el plan `draft` para `date`.
 *  2. Obtiene ids de `orders` pendientes para esa fecha (sin plan_stop_id).
 *  3. Invoca RPC `assign_orders_to_plan` (merge server-side) — Fase C.
 *  4. Auto-selecciona vehículos cuyos `skills` cubren `UNION(required_skills)` de los stops.
 *  5. Llama a Vroom via Railway (`vroomService.optimize`) con `mode='balance_stops'` por default.
 *  6. Devuelve `{ plan, preview }` para que la UI abra el wizard con preview pre-cargado.
 *
 * NUNCA auto-aplica: el operador confirma desde `VroomWizardModal`.
 */
export function useOneClickOptimize(
  orgId: string | undefined,
  options: OneClickOptimizeOptions = {},
): UseOneClickOptimizeReturn {
  const { mode = 'balance_stops', returnToDepot = true } = options;

  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OneClickOptimizeResult | null>(null);

  const reset = useCallback(() => {
    setError(null);
    setResult(null);
  }, []);

  const execute = useCallback(
    async (date: string): Promise<ServiceResult<OneClickOptimizeResult>> => {
      if (!orgId) {
        const msg = 'No hay organización activa.';
        setError(msg);
        return { success: false, error: msg };
      }

      setIsRunning(true);
      setError(null);

      try {
        // ── 1. find-or-create plan (draft) ──
        const plan = await findOrCreatePlanForDate(orgId, date);
        if (!plan.success) {
          setError(plan.error);
          setIsRunning(false);
          return plan;
        }

        // ── 2. pending order ids for the date ──
        const pending = await fetchPendingOrderIds(orgId, date);
        if (!pending.success) {
          setError(pending.error);
          setIsRunning(false);
          return pending;
        }

        // ── 3. assign orders to plan (RPC Fase C) ──
        const assign = await assignOrdersToPlan(pending.data, plan.data.id);
        if (!assign.success) {
          setError(assign.error);
          setIsRunning(false);
          return assign;
        }

        // ── 4. auto-pick vehicles by skills ──
        const vehicles = await autoSelectVehicles(orgId, plan.data.id);
        if (!vehicles.success) {
          setError(vehicles.error);
          setIsRunning(false);
          return vehicles;
        }

        // ── 5. optimize via Railway ──
        const optimizeRes = await optimizeVroom({
          plan_id: plan.data.id,
          mode,
          return_to_depot: returnToDepot,
          vehicle_ids: vehicles.data,
        });

        if (!optimizeRes.success) {
          setError(optimizeRes.error);
          setIsRunning(false);
          return optimizeRes;
        }

        const finalResult: OneClickOptimizeResult = {
          plan: plan.data,
          selectedVehicleIds: vehicles.data,
          assignReport: assign.data,
          preview: optimizeRes.data,
        };
        setResult(finalResult);
        setIsRunning(false);
        return { success: true, data: finalResult };
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error desconocido';
        setError(msg);
        setIsRunning(false);
        return { success: false, error: msg };
      }
    },
    [orgId, mode, returnToDepot],
  );

  return { execute, isRunning, error, result, reset };
}

// ────────────────────────────────────────────────────────────────
// Helpers (server interactions) — aislados para facilitar tests.
// ────────────────────────────────────────────────────────────────

async function findOrCreatePlanForDate(
  orgId: string,
  date: string,
): Promise<ServiceResult<Plan>> {
  const existing = await supabase
    .from('plans')
    .select('*')
    .eq('org_id', orgId)
    .eq('date', date)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing.error && existing.error.code !== 'PGRST116') {
    return { success: false, error: existing.error.message };
  }
  if (existing.data) return { success: true, data: existing.data as Plan };

  const insert = await supabase
    .from('plans')
    .insert({ org_id: orgId, date, name: `Plan ${date}` })
    .select()
    .single();

  if (insert.error) return { success: false, error: insert.error.message };
  return { success: true, data: insert.data as Plan };
}

async function fetchPendingOrderIds(
  orgId: string,
  date: string,
): Promise<ServiceResult<string[]>> {
  const { data, error } = await supabase
    .from('orders')
    .select('id')
    .eq('org_id', orgId)
    .eq('requested_date', date)
    .is('plan_stop_id', null)
    .in('status', ['pending', 'scheduled']);

  if (error) return { success: false, error: error.message };
  return { success: true, data: (data ?? []).map((r) => r.id as string) };
}

interface AssignRpcRow {
  order_id: string;
  stop_id: string | null;
  plan_stop_id: string | null;
  action: 'merged_existing' | 'created_new' | 'skipped_already_assigned';
  match_quality: string | null;
}

async function assignOrdersToPlan(
  orderIds: string[],
  planId: string,
): Promise<ServiceResult<{ created: number; merged: number; skipped: number }>> {
  if (orderIds.length === 0) {
    return { success: true, data: { created: 0, merged: 0, skipped: 0 } };
  }

  // RPC Fase C — devuelve una fila por order tocada.
  const { data, error } = await supabase.rpc('assign_orders_to_plan', {
    p_order_ids: orderIds,
    p_plan_id: planId,
    p_allow_override: false,
  });

  if (error) return { success: false, error: error.message };

  const rows = (data ?? []) as AssignRpcRow[];
  const report = {
    created: rows.filter((r) => r.action === 'created_new').length,
    merged: rows.filter((r) => r.action === 'merged_existing').length,
    skipped: rows.filter((r) => r.action === 'skipped_already_assigned').length,
  };
  return { success: true, data: report };
}

async function autoSelectVehicles(
  orgId: string,
  planId: string,
): Promise<ServiceResult<string[]>> {
  // UNION de required_skills de los plan_stops del plan.
  const { data: stopsRows, error: stopsErr } = await supabase
    .from('plan_stops')
    .select('required_skills')
    .eq('plan_id', planId);

  if (stopsErr) return { success: false, error: stopsErr.message };

  const requiredSkills = new Set<string>();
  for (const row of (stopsRows ?? []) as Array<{ required_skills: string[] | null }>) {
    for (const s of row.required_skills ?? []) requiredSkills.add(s);
  }

  const { data: vehicles, error: vehErr } = await supabase
    .from('vehicles')
    .select('*')
    .eq('org_id', orgId);

  if (vehErr) return { success: false, error: vehErr.message };

  const typedVehicles = (vehicles ?? []) as Array<Vehicle & { skills?: string[] | null }>;

  // Mientras no haya plan_stops con skills, se seleccionan todos los vehículos del org.
  if (requiredSkills.size === 0) {
    return { success: true, data: typedVehicles.map((v) => v.id) };
  }

  const covering = typedVehicles.filter((v) => {
    const skills = new Set(v.skills ?? []);
    for (const req of requiredSkills) {
      if (!skills.has(req)) return false;
    }
    return true;
  });

  if (covering.length === 0) {
    const missing = Array.from(requiredSkills).join(', ');
    return {
      success: false,
      error: `No hay vehículos que cubran las skills requeridas: ${missing}`,
    };
  }

  return { success: true, data: covering.map((v) => v.id) };
}
