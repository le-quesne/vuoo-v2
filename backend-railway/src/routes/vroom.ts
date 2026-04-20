import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';

export const vroomRoutes = new Hono();

// "HH:MM" or "HH:MM:SS" → segundos desde medianoche, null si inválido.
function parseTimeToSeconds(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const s = m[3] ? parseInt(m[3], 10) : 0;
  if (h > 23 || min > 59 || s > 59) return null;
  return h * 3600 + min * 60 + s;
}

type VroomMode = 'efficiency' | 'balance_stops' | 'balance_time' | 'consolidate';

interface VroomVehicle {
  id: number;
  start: [number, number];
  end?: [number, number];
  capacity?: number[];
  time_window?: [number, number];
  max_tasks?: number;
  max_travel_time?: number;
}

interface VroomJob {
  id: number;
  location: [number, number];
  service?: number;
  delivery?: number[];
  time_windows?: [number, number][];
}

interface VroomBody {
  plan_id?: string;
  mode?: VroomMode;
  return_to_depot?: boolean;
  vehicle_ids?: string[];
}

/**
 * Gateway Vroom: transforma plan+vehicles → Vroom jobs/vehicles, llama al
 * solver self-hosted, mapea la respuesta de vuelta a plan_stop_ids.
 *
 * Reemplaza a la antigua Edge Function `optimize-routes-vroom` (PRD 12 §D.3).
 * Usa anon key + JWT del caller para que RLS aplique automáticamente.
 */
vroomRoutes.post('/optimize', async (c) => {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const VROOM_URL = process.env.VROOM_URL;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !VROOM_URL) {
    return c.json({ error: 'missing_server_configuration' }, 500);
  }

  const authHeader = c.req.header('Authorization');
  if (!authHeader) return c.json({ error: 'missing_authorization' }, 401);

  const body = (await c.req.json().catch(() => null)) as VroomBody | null;
  const planId = body?.plan_id;
  const mode: VroomMode = body?.mode ?? 'efficiency';
  const returnToDepot = body?.return_to_depot !== false;
  const filterVehicleIds = body?.vehicle_ids;

  if (!planId) return c.json({ error: 'Body must be { plan_id: UUID }' }, 400);

  // Cliente con JWT del caller → RLS aplica.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Fetch plan_stops con datos del stop.
  const { data: planStops, error: psErr } = await supabase
    .from('plan_stops')
    .select(
      `id, route_id, stop:stops (lat, lng, duration_minutes, weight_kg, time_window_start, time_window_end)`,
    )
    .eq('plan_id', planId)
    .neq('status', 'completed')
    .neq('status', 'cancelled');

  if (psErr) {
    return c.json({ error: 'failed_to_load_plan_stops', details: psErr.message }, 500);
  }

  // 2. Fetch plan's org default depot (fallback).
  const { data: planRow, error: planErr } = await supabase
    .from('plans')
    .select(`org:organizations (default_depot_lat, default_depot_lng)`)
    .eq('id', planId)
    .maybeSingle();

  if (planErr) {
    return c.json({ error: 'failed_to_load_plan', details: planErr.message }, 500);
  }

  const planOrg = (planRow?.org as unknown as Record<string, unknown> | null) ?? null;
  const orgDefaultDepotLng = (planOrg?.default_depot_lng as number | null) ?? null;
  const orgDefaultDepotLat = (planOrg?.default_depot_lat as number | null) ?? null;

  // 3. Fetch routes con vehicle + filtro opcional por vehicle_ids.
  let routesQuery = supabase
    .from('routes')
    .select(
      `id, vehicle_id, vehicle:vehicles (capacity_weight_kg, time_window_start, time_window_end, depot_lat, depot_lng, skills)`,
    )
    .eq('plan_id', planId);

  if (filterVehicleIds && filterVehicleIds.length > 0) {
    routesQuery = routesQuery.in('vehicle_id', filterVehicleIds);
  }

  const { data: routes, error: rErr } = await routesQuery;

  if (rErr) {
    return c.json({ error: 'failed_to_load_routes', details: rErr.message }, 500);
  }

  const usableStops = (planStops ?? []).filter((ps) => {
    const stop = ps.stop as unknown as Record<string, unknown> | null;
    return stop && typeof stop.lat === 'number' && typeof stop.lng === 'number';
  });

  if (usableStops.length === 0) {
    return c.json({ error: 'No stops with coordinates in plan' }, 400);
  }

  if (!routes || routes.length === 0) {
    return c.json({ error: 'Plan has no routes/vehicles assigned' }, 400);
  }

  // Mapeo UUID ↔ integer IDs para Vroom.
  const vehicleIdToRoute = new Map<number, { routeId: string; vehicleId: string }>();
  const jobIdToPlanStop = new Map<number, string>();
  const vehiclesMissingDepot: string[] = [];

  const vroomVehicles: VroomVehicle[] = [];
  for (let idx = 0; idx < routes.length; idx++) {
    const route = routes[idx];
    const vroomId = idx + 1;
    const v = route.vehicle as unknown as Record<string, unknown> | null;

    const depotLng = (v?.depot_lng as number | null) ?? orgDefaultDepotLng;
    const depotLat = (v?.depot_lat as number | null) ?? orgDefaultDepotLat;

    if (depotLng === null || depotLat === null) {
      vehiclesMissingDepot.push(route.vehicle_id as string);
      continue;
    }

    vehicleIdToRoute.set(vroomId, {
      routeId: route.id as string,
      vehicleId: route.vehicle_id as string,
    });

    const capacityKg =
      v && typeof v.capacity_weight_kg === 'number' ? v.capacity_weight_kg : null;
    const tws = v ? parseTimeToSeconds(v.time_window_start as string | null) : null;
    const twe = v ? parseTimeToSeconds(v.time_window_end as string | null) : null;

    const vehicle: VroomVehicle = {
      id: vroomId,
      start: [depotLng, depotLat],
    };
    if (returnToDepot) vehicle.end = [depotLng, depotLat];
    if (capacityKg !== null && capacityKg > 0) vehicle.capacity = [Math.round(capacityKg)];
    if (tws !== null && twe !== null && twe > tws) vehicle.time_window = [tws, twe];
    vroomVehicles.push(vehicle);
  }

  // Aplicar modos de balanceo después de resolver depots.
  if (vroomVehicles.length > 0 && usableStops.length > 0) {
    if (mode === 'balance_stops') {
      const maxTasks = Math.ceil(usableStops.length / vroomVehicles.length);
      for (const v of vroomVehicles) v.max_tasks = maxTasks;
    } else if (mode === 'balance_time' && vroomVehicles.length > 1) {
      const totalWindowSec = vroomVehicles.reduce((acc, v) => {
        if (v.time_window) return acc + (v.time_window[1] - v.time_window[0]);
        return acc + 8 * 3600;
      }, 0);
      const perVehicleCap = Math.ceil(totalWindowSec / vroomVehicles.length);
      for (const v of vroomVehicles) v.max_travel_time = perVehicleCap;
    }
  }

  if (vroomVehicles.length === 0) {
    return c.json(
      {
        error: 'No depot configured',
        message:
          'Configura un depot default en la organización (Settings) o por vehículo antes de optimizar.',
        vehicles_missing_depot: vehiclesMissingDepot,
      },
      400,
    );
  }

  const vroomJobs: VroomJob[] = usableStops.map((ps, idx) => {
    const vroomId = idx + 1;
    jobIdToPlanStop.set(vroomId, ps.id as string);
    const stop = ps.stop as unknown as Record<string, unknown>;
    const lng = stop.lng as number;
    const lat = stop.lat as number;
    const durationMin = (stop.duration_minutes as number | null) ?? 5;
    const weightKg = stop.weight_kg as number | null;
    const tws = parseTimeToSeconds(stop.time_window_start as string | null);
    const twe = parseTimeToSeconds(stop.time_window_end as string | null);

    const job: VroomJob = {
      id: vroomId,
      location: [lng, lat],
      service: Math.max(0, Math.round(durationMin * 60)),
    };
    if (weightKg !== null && weightKg > 0) job.delivery = [Math.round(weightKg)];
    if (tws !== null && twe !== null && twe > tws) job.time_windows = [[tws, twe]];
    return job;
  });

  // Llamar a Vroom.
  const vroomPayload: Record<string, unknown> = {
    vehicles: vroomVehicles,
    jobs: vroomJobs,
  };
  if (mode === 'consolidate') {
    vroomPayload.options = { minimize_vehicles: true };
  }

  const vroomRes = await fetch(VROOM_URL.replace(/\/$/, '') + '/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vroomPayload),
  });

  if (!vroomRes.ok) {
    const text = await vroomRes.text();
    return c.json(
      { error: 'vroom_request_failed', status: vroomRes.status, details: text.slice(0, 500) },
      502,
    );
  }

  const vroomData = (await vroomRes.json()) as Record<string, unknown>;

  if (vroomData.code !== 0) {
    return c.json(
      { error: 'vroom_returned_error', code: vroomData.code, details: vroomData.error ?? null },
      422,
    );
  }

  // Mapear respuesta de Vroom de vuelta a UUIDs.
  const resultRoutes = (
    (vroomData.routes as Array<Record<string, unknown>> | undefined) ?? []
  ).map((r) => {
    const mapping = vehicleIdToRoute.get(r.vehicle as number);
    const steps = (r.steps as Array<Record<string, unknown>>)
      .filter((step) => step.type === 'job')
      .map((step) => jobIdToPlanStop.get(step.job as number))
      .filter((v): v is string => typeof v === 'string');

    return {
      route_id: mapping?.routeId ?? null,
      vehicle_id: mapping?.vehicleId ?? null,
      total_duration: (r.duration as number) ?? 0,
      total_distance: (r.distance as number | undefined) ?? null,
      ordered_plan_stop_ids: steps,
    };
  });

  const unassigned = (
    (vroomData.unassigned as Array<Record<string, unknown>> | undefined) ?? []
  ).map((u) => ({
    plan_stop_id: jobIdToPlanStop.get(u.id as number) ?? null,
    reason: (u.description as string | undefined) ?? 'unassigned',
  }));

  const summary = vroomData.summary as Record<string, unknown> | undefined;

  return c.json({
    summary: {
      cost: summary?.cost ?? 0,
      routes: summary?.routes ?? resultRoutes.length,
      unassigned: summary?.unassigned ?? unassigned.length,
      duration: summary?.duration ?? 0,
    },
    routes: resultRoutes,
    unassigned,
  });
});
