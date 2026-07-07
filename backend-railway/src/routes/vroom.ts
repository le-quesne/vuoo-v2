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

// Decodifica un polyline5 (precisión 1e-5, formato Google/Mapbox) a [lng, lat][].
// Vroom devuelve la geometría en este formato cuando se pasa `options.g = true`.
// Lo decodificamos en el backend para que el frontend reciba GeoJSON-ready
// coords y las guarde directo en `routes.geometry` sin más procesamiento.
function decodePolyline5(str: string): [number, number][] {
  const coords: [number, number][] = [];
  let lat = 0;
  let lng = 0;
  let i = 0;
  while (i < str.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = str.charCodeAt(i++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      byte = str.charCodeAt(i++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    coords.push([lng / 1e5, lat / 1e5]);
  }
  return coords;
}

type VroomMode = 'efficiency' | 'balance_stops' | 'balance_time' | 'consolidate' | 'on_time';

interface VroomCosts {
  fixed?: number;
  per_hour?: number;
  per_km?: number;
}

interface VroomVehicle {
  id: number;
  start: [number, number];
  end?: [number, number];
  capacity?: number[];
  time_window?: [number, number];
  max_tasks?: number;
  max_travel_time?: number;
  costs?: VroomCosts;
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
  /** PRD 25 (multi-depot): depot elegido en el wizard para esta corrida. */
  depot_id?: string;
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
  const depotIdOverride = body?.depot_id;

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

  // 1b. Fetch órdenes asociadas a esos plan_stops y agregarlas por plan_stop_id.
  // El peso REAL de la entrega vive en `orders.total_weight_kg`; `stops.weight_kg`
  // es solo un default histórico de la dirección. Si no usamos las órdenes, Vroom
  // ve capacity = 0 en cada job y mete todo en un vehículo (síntoma: planes con
  // 2+ vehículos quedan cargados en uno solo aunque haya sobrecarga obvia).
  const planStopIds = (planStops ?? []).map((ps) => ps.id as string);
  const orderWeightByPlanStop = new Map<string, number>();
  if (planStopIds.length > 0) {
    const { data: orders, error: oErr } = await supabase
      .from('orders')
      .select('plan_stop_id, total_weight_kg')
      .in('plan_stop_id', planStopIds);

    if (oErr) {
      return c.json({ error: 'failed_to_load_orders', details: oErr.message }, 500);
    }

    for (const row of orders ?? []) {
      const psid = row.plan_stop_id as string | null;
      const kg = row.total_weight_kg as number | null;
      if (!psid || kg == null || kg <= 0) continue;
      orderWeightByPlanStop.set(psid, (orderWeightByPlanStop.get(psid) ?? 0) + kg);
    }
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

  // 2b. PRD 25 (multi-depot): depot elegido en el wizard para esta corrida.
  // Se valida implícitamente por RLS — si depotIdOverride no pertenece a la
  // org del caller, la policy de `depots` no devuelve la fila y cae al
  // default de la org como si no se hubiese mandado nada.
  let selectedDepotLat: number | null = null;
  let selectedDepotLng: number | null = null;
  if (depotIdOverride) {
    const { data: depotRow } = await supabase
      .from('depots')
      .select('lat, lng')
      .eq('id', depotIdOverride)
      .maybeSingle();
    if (depotRow) {
      selectedDepotLat = depotRow.lat as number;
      selectedDepotLng = depotRow.lng as number;
    }
  }

  // 3. Fetch routes con vehicle + filtro opcional por vehicle_ids.
  let routesQuery = supabase
    .from('routes')
    .select(
      `id, vehicle_id, vehicle:vehicles (capacity_weight_kg, time_window_start, time_window_end, depot_lat, depot_lng, skills, depot:depots(lat, lng))`,
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
    // Precedencia de depot (PRD 25): depot propio del vehículo (vehicles.depot_id,
    // vía FK a `depots`) > override legacy ad-hoc (vehicles.depot_lat/lng) >
    // depot elegido en el wizard para esta corrida > default de la org.
    const vDepot = v?.depot as { lat: number; lng: number } | null | undefined;

    const depotLng =
      (vDepot?.lng as number | undefined) ??
      (v?.depot_lng as number | null) ??
      selectedDepotLng ??
      orgDefaultDepotLng;
    const depotLat =
      (vDepot?.lat as number | undefined) ??
      (v?.depot_lat as number | null) ??
      selectedDepotLat ??
      orgDefaultDepotLat;

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

  // Servicio total — útil para balance_time (Vroom solo cuenta viaje, no servicio).
  const totalServiceSec = usableStops.reduce((acc, ps) => {
    const stop = ps.stop as unknown as Record<string, unknown>;
    const durationMin = (stop.duration_minutes as number | null) ?? 5;
    return acc + Math.max(0, Math.round(durationMin * 60));
  }, 0);
  const avgServicePerVehicle = Math.ceil(totalServiceSec / Math.max(1, vroomVehicles.length));

  // Aplicar configuración por modo. Cada modo cambia el comportamiento del solver
  // para cumplir con la descripción que ve el usuario en la UI:
  //
  //   - efficiency  → "Minimiza el costo total: menos kilómetros y menos horas."
  //   - consolidate → "Usa la menor cantidad posible de vehículos."
  //   - balance_stops → "Reparte una cantidad similar de paradas entre todos
  //                      los vehículos disponibles."
  //   - balance_time  → "Usa todos los vehículos y distribuye la jornada para
  //                      que todos vuelvan al depot a una hora similar."
  //   - on_time     → "Prioriza llegar dentro de la ventana horaria por sobre
  //                    el costo total."
  //
  // Notas sobre Vroom:
  //   - Defaults: vehicle.costs = { fixed: 0, per_hour: 3600 }  →  costo = duración (s).
  //   - Time windows son HARD constraints: Vroom no las viola, las jobs no factibles
  //     se vuelven `unassigned`. Para "on_time" lo que ajustamos es la PROPENSIÓN
  //     a abrir vehículos extras / aceptar detours para asignar más jobs.
  //   - `minimize_vehicles: true` cambia el objetivo: primero minimiza V, luego costo.
  if (vroomVehicles.length > 0 && usableStops.length > 0) {
    if (mode === 'efficiency') {
      // fixed=1200 (20min) → solo abre un vehículo extra si ahorra ≥20min de
      // viaje agregado. Default per_hour ya minimiza tiempo total.
      for (const v of vroomVehicles) v.costs = { fixed: 1200 };
    } else if (mode === 'consolidate') {
      // fixed alto + minimize_vehicles fuerza concentración real. La flag
      // se aplica más abajo en `vroomPayload.options`.
      //
      // 86400 = 24h equivalentes en el modelo de costo de Vroom (per_hour
      // default = 3600 u/h). Tiene que ser mayor que cualquier ahorro de
      // viaje creíble por usar un camión extra; con 18000 (5h) no alcanzaba:
      // en planes de 30+ paradas el ahorro de driving por partir en 2 rutas
      // superaba esas 5h y Vroom seguía abriendo el 2do vehículo.
      for (const v of vroomVehicles) v.costs = { fixed: 86400 };
    } else if (mode === 'balance_stops' || mode === 'balance_time') {
      // max_tasks=ceil(N/V) hace inviable la solución con V-1 vehículos, así
      // que Vroom se ve forzado a usar todos.
      // fixed=0 saca la presión de "menos vehículos = más barato", para que el
      // solver no consolide cuando podría repartir.
      for (const v of vroomVehicles) v.costs = { fixed: 0 };
      if (usableStops.length >= vroomVehicles.length) {
        const maxTasks = Math.ceil(usableStops.length / vroomVehicles.length);
        for (const v of vroomVehicles) v.max_tasks = maxTasks;
      }
      // balance_time además aplica max_travel_time en una 2da pasada — ver
      // bloque más abajo después del primer callVroom.
    } else if (mode === 'on_time') {
      // Las TW ya son hard constraints. Para "priorizar" cumplirlas:
      //   1. fixed bajo (600s = 10min): Vroom abre vehículos extras casi gratis
      //      para encajar más jobs con TW estrechas (sin esto puede dejar
      //      paradas como unassigned con tal de no abrir un camión más).
      //   2. per_hour bajo (360 = 1/10 default): un detour o esperar a una
      //      ventana cuesta 10× menos → Vroom prefiere rutas más largas o
      //      con espera si eso respeta más ventanas.
      for (const v of vroomVehicles) v.costs = { fixed: 600, per_hour: 360 };
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
    // Peso real de la entrega = SUM(orders.total_weight_kg) por plan_stop.
    // Fallback a stops.weight_kg (legacy) si no hay órdenes asociadas.
    const orderWeight = orderWeightByPlanStop.get(ps.id as string);
    const weightKg = orderWeight && orderWeight > 0
      ? orderWeight
      : (stop.weight_kg as number | null);
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

  // Llamar a Vroom (helper para reuso en doble pasada de balance_time).
  async function callVroom(
    payload: Record<string, unknown>,
  ): Promise<
    | { ok: true; data: Record<string, unknown> }
    | { ok: false; status: number; body: string | Record<string, unknown> }
  > {
    const res = await fetch(VROOM_URL!.replace(/\/$/, '') + '/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, status: res.status, body: text.slice(0, 500) };
    }
    const data = (await res.json()) as Record<string, unknown>;
    if (data.code !== 0) {
      return { ok: false, status: 422, body: data };
    }
    return { ok: true, data };
  }

  // `g: true` pide a Vroom que devuelva la polilínea real (polyline5) de cada
  // ruta vía OSRM. Sin esto, el frontend tendría que recalcular la geometría
  // contra Mapbox Directions y choca con el límite de 25 waypoints por request.
  const vroomOptions: Record<string, unknown> = { g: true };
  if (mode === 'consolidate') vroomOptions.minimize_vehicles = true;

  const vroomPayload: Record<string, unknown> = {
    vehicles: vroomVehicles,
    jobs: vroomJobs,
    options: vroomOptions,
  };

  console.log(`[vroom][${mode}] sending`, JSON.stringify({
    plan_id: planId,
    mode,
    vehicles: vroomVehicles.map((v) => ({
      id: v.id,
      capacity: v.capacity,
      time_window: v.time_window,
      max_tasks: v.max_tasks,
      max_travel_time: v.max_travel_time,
      costs: v.costs,
    })),
    jobs_count: vroomJobs.length,
    jobs_total_weight: vroomJobs.reduce((s, j) => s + (j.delivery?.[0] ?? 0), 0),
    jobs_with_tw: vroomJobs.filter((j) => j.time_windows && j.time_windows.length > 0).length,
    options: vroomOptions,
  }));

  const firstCall = await callVroom(vroomPayload);
  if (!firstCall.ok) {
    console.log(`[vroom][${mode}] FAIL`, firstCall.status, JSON.stringify(firstCall.body).slice(0, 500));
    if (firstCall.status === 422) {
      const body = firstCall.body as Record<string, unknown>;
      return c.json(
        { error: 'vroom_returned_error', code: body.code, details: body.error ?? null },
        422,
      );
    }
    return c.json(
      { error: 'vroom_request_failed', status: firstCall.status, details: firstCall.body as string },
      502,
    );
  }

  let vroomData = firstCall.data;
  const sum1 = vroomData.summary as Record<string, unknown> | undefined;
  const routes1Arr = (vroomData.routes as Array<Record<string, unknown>> | undefined) ?? [];
  console.log(`[vroom][${mode}] solved`, JSON.stringify({
    cost: sum1?.cost,
    routes_used: routes1Arr.length,
    unassigned: sum1?.unassigned,
    routes: routes1Arr.map((r) => ({
      vehicle: r.vehicle,
      duration_sec: r.duration,
      service_sec: r.service,
      waiting_sec: r.waiting_time,
      delivery: r.delivery,
      jobs: (r.steps as Array<Record<string, unknown>> | undefined)?.filter((s) => s.type === 'job').length,
    })),
  }));

  // ── balance_time: doble pasada ──
  // 1ra pasada (acabamos de hacerla) sin restricción → medimos viaje por ruta.
  // Vroom devuelve `r.duration` como tiempo de VIAJE solamente (no incluye
  // servicio). El objetivo del modo es balancear la JORNADA TOTAL del conductor
  // (viaje + servicio). Por eso el target se calcula sobre tiempo total y
  // después se descuenta el servicio promedio para que max_travel_time
  // (que Vroom interpreta como travel-only) deje espacio al servicio.
  if (mode === 'balance_time') {
    const routes1 = (vroomData.routes as Array<Record<string, unknown>> | undefined) ?? [];
    const travelDurations = routes1.map((r) => (r.duration as number) ?? 0);
    if (travelDurations.length > 1) {
      const totalTravel = travelDurations.reduce((a, b) => a + b, 0);
      const avgTravel = totalTravel / travelDurations.length;
      const maxTravelObs = Math.max(...travelDurations);
      const skewRatio = avgTravel > 0 ? maxTravelObs / avgTravel : 1;

      // Solo gastar una segunda llamada si vale la pena.
      if (skewRatio > 1.1) {
        // Tiempo total estimado por vehículo = (viaje + servicio) / N × 1.10.
        // Después restamos servicio promedio para obtener el cap de viaje
        // que entiende Vroom.
        const totalTime = totalTravel + totalServiceSec;
        const targetTotal = (totalTime / vroomVehicles.length) * 1.1;
        const maxTravel = Math.max(60, Math.ceil(targetTotal - avgServicePerVehicle));
        for (const v of vroomVehicles) v.max_travel_time = maxTravel;

        const secondCall = await callVroom(vroomPayload);
        if (secondCall.ok) {
          vroomData = secondCall.data;
        }
        // Si la 2da falla (ej. unassigned), nos quedamos con la 1ra — mejor
        // un plan desbalanceado que ninguno.
      }
    }
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

    const encoded = r.geometry;
    const geometry =
      typeof encoded === 'string' && encoded.length > 0
        ? decodePolyline5(encoded)
        : null;

    return {
      route_id: mapping?.routeId ?? null,
      vehicle_id: mapping?.vehicleId ?? null,
      total_duration: (r.duration as number) ?? 0,
      total_distance: (r.distance as number | undefined) ?? null,
      ordered_plan_stop_ids: steps,
      geometry,
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
