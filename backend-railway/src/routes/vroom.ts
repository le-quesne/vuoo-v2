import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { fetchOsrmTable } from '../lib/osrm.js';

export const vroomRoutes = new Hono();

// Velocidad de referencia para convertir metros → "segundos-equivalentes" al
// ponderar distancia en la matriz de costo (PRD 26 Fase 2). 40 km/h es un
// promedio urbano razonable para reparto de última milla; no necesita ser
// exacto porque solo escala el peso relativo de wDistancia, no una métrica
// que se le muestre al usuario.
const REFERENCE_SPEED_MPS = 40 / 3.6;

// Penalización (en segundos-equivalentes) aplicada cuando un par de stops
// nunca compartió ruta históricamente, escalada por wHistoria. Un valor de
// 1 en wHistoria agrega esto al costo del par menos familiar del plan.
const MAX_HISTORY_PENALTY_SECONDS = 900; // 15 min equivalentes

// Umbral de confianza para reemplazar duration_minutes por el dwell time
// real aprendido (PRD 26 Fase 3). Constantes iniciales — tunear con datos
// reales una vez que haya volumen suficiente en customer_service_stats.
const SERVICE_TIME_MIN_SAMPLES = 5;
const SERVICE_TIME_MAX_CV = 0.5; // coeficiente de variación (stddev/mean)
const SERVICE_TIME_SHRINKAGE_K = 5;

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
  // *_index solo se usan cuando se manda una matriz propia (weights, Fase 2).
  start_index?: number;
  end_index?: number;
  capacity?: number[];
  skills?: number[];
  time_window?: [number, number];
  max_tasks?: number;
  max_travel_time?: number;
  costs?: VroomCosts;
}

interface VroomJob {
  id: number;
  location: [number, number];
  location_index?: number;
  service?: number;
  delivery?: number[];
  skills?: number[];
  priority?: number;
  time_windows?: [number, number][];
}

// Pesos 0–1 para la matriz de costo ponderada (PRD 26 Fase 2). Si vienen en
// el body, reemplazan los 5 presets de `mode` por una matriz de costo propia
// calculada desde OSRM /table. Si no vienen, comportamiento 100% igual al
// de siempre (los 5 modos).
interface VroomWeights {
  time?: number;
  distance?: number;
  history?: number;
}

// Vroom exige skills como enteros; la DB los guarda como strings
// ('refrigerated', 'hazmat'). Se arma un índice ad-hoc por request — no
// necesita persistir entre llamadas, solo ser consistente dentro de una.
function buildSkillIndex(skillLists: Array<string[] | null | undefined>): Map<string, number> {
  const index = new Map<string, number>();
  let next = 1;
  for (const list of skillLists) {
    for (const skill of list ?? []) {
      if (!index.has(skill)) index.set(skill, next++);
    }
  }
  return index;
}

function toVroomSkills(
  skills: string[] | null | undefined,
  index: Map<string, number>,
): number[] | undefined {
  if (!skills || skills.length === 0) return undefined;
  const mapped = skills.map((s) => index.get(s)).filter((n): n is number => n !== undefined);
  return mapped.length > 0 ? mapped : undefined;
}

// Capacidad "sin límite" para la dimensión de volumen cuando un vehículo no
// tiene volume_m3 configurado, pero OTRO vehículo del mismo plan sí — Vroom
// exige que todos los arrays capacity/delivery tengan la misma longitud.
const UNBOUNDED_CAPACITY = 999_999_999;

interface VroomBody {
  plan_id?: string;
  mode?: VroomMode;
  return_to_depot?: boolean;
  vehicle_ids?: string[];
  /** PRD 25 (multi-depot): depot elegido en el wizard para esta corrida. */
  depot_id?: string;
  weights?: VroomWeights;
}

// Shrinkage hacia el valor manual + gate por coeficiente de variación (PRD 26
// Fase 3). No reemplaza 1:1: con pocas muestras o alta variabilidad, confía
// más en el valor manual. `median` en segundos, `manualMinutes` en minutos.
function effectiveServiceMinutes(
  stat: { n_samples: number; median_dwell_seconds: number | null; mean_dwell_seconds: number | null; stddev_dwell_seconds: number | null } | undefined,
  manualMinutes: number,
): number {
  if (!stat || stat.n_samples < SERVICE_TIME_MIN_SAMPLES) return manualMinutes;
  const mean = stat.mean_dwell_seconds ?? 0;
  const stddev = stat.stddev_dwell_seconds ?? 0;
  if (mean <= 0) return manualMinutes;
  const cv = stddev / mean;
  if (cv > SERVICE_TIME_MAX_CV) return manualMinutes;

  const median = stat.median_dwell_seconds ?? mean;
  const w = stat.n_samples / (stat.n_samples + SERVICE_TIME_SHRINKAGE_K);
  const blendedSeconds = w * median + (1 - w) * manualMinutes * 60;
  return blendedSeconds / 60;
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
  const weights = body?.weights ?? null;
  const useWeightedMatrix = weights !== null;

  if (!planId) return c.json({ error: 'Body must be { plan_id: UUID }' }, 400);

  const OSRM_URL = process.env.OSRM_URL;
  if (useWeightedMatrix && !OSRM_URL) {
    return c.json(
      { error: 'missing_server_configuration', message: 'OSRM_URL no configurado (requerido para weights).' },
      500,
    );
  }

  // Cliente con JWT del caller → RLS aplica.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Fetch plan_stops con datos del stop.
  const { data: planStops, error: psErr } = await supabase
    .from('plan_stops')
    .select(
      `id, route_id, priority, required_skills, volume_m3,
       stop:stops (lat, lng, duration_minutes, weight_kg, time_window_start, time_window_end, priority, required_skills, customer_id)`,
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
  // Volumen sigue el mismo patrón que peso (real desde orders, cache en plan_stops).
  const planStopIds = (planStops ?? []).map((ps) => ps.id as string);
  const orderWeightByPlanStop = new Map<string, number>();
  const orderVolumeByPlanStop = new Map<string, number>();
  if (planStopIds.length > 0) {
    const { data: orders, error: oErr } = await supabase
      .from('orders')
      .select('plan_stop_id, total_weight_kg, total_volume_m3')
      .in('plan_stop_id', planStopIds);

    if (oErr) {
      return c.json({ error: 'failed_to_load_orders', details: oErr.message }, 500);
    }

    for (const row of orders ?? []) {
      const psid = row.plan_stop_id as string | null;
      if (!psid) continue;
      const kg = row.total_weight_kg as number | null;
      if (kg != null && kg > 0) {
        orderWeightByPlanStop.set(psid, (orderWeightByPlanStop.get(psid) ?? 0) + kg);
      }
      const vol = row.total_volume_m3 as number | null;
      if (vol != null && vol > 0) {
        orderVolumeByPlanStop.set(psid, (orderVolumeByPlanStop.get(psid) ?? 0) + vol);
      }
    }
  }

  // 2. Fetch plan's org default depot (fallback).
  const { data: planRow, error: planErr } = await supabase
    .from('plans')
    .select(`org_id, org:organizations (default_depot_lat, default_depot_lng)`)
    .eq('id', planId)
    .maybeSingle();

  if (planErr) {
    return c.json({ error: 'failed_to_load_plan', details: planErr.message }, 500);
  }

  const planOrgId = (planRow?.org_id as string | null) ?? null;
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
      `id, vehicle_id, vehicle:vehicles (capacity_weight_kg, time_window_start, time_window_end, depot_lat, depot_lng, skills, volume_m3, price_per_km, max_stops, depot:depots(lat, lng))`,
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

  // 4. Dwell time aprendido por cliente (PRD 26 Fase 3) — aplica siempre,
  // independiente de `weights`. Gateado por confianza en `effectiveServiceMinutes`.
  const customerIds = Array.from(
    new Set(
      usableStops
        .map((ps) => (ps.stop as unknown as Record<string, unknown>).customer_id as string | null)
        .filter((id): id is string => id != null),
    ),
  );

  const serviceStatsByCustomer = new Map<
    string,
    { n_samples: number; median_dwell_seconds: number | null; mean_dwell_seconds: number | null; stddev_dwell_seconds: number | null }
  >();
  if (customerIds.length > 0) {
    const { data: stats, error: statsErr } = await supabase
      .from('customer_service_stats')
      .select('customer_id, n_samples, median_dwell_seconds, mean_dwell_seconds, stddev_dwell_seconds')
      .in('customer_id', customerIds);
    if (statsErr) {
      // No bloqueante: si falla, seguimos con los tiempos manuales.
      console.warn('[vroom] failed_to_load_customer_service_stats', statsErr.message);
    } else {
      for (const row of stats ?? []) {
        serviceStatsByCustomer.set(row.customer_id as string, {
          n_samples: row.n_samples as number,
          median_dwell_seconds: row.median_dwell_seconds as number | null,
          mean_dwell_seconds: row.mean_dwell_seconds as number | null,
          stddev_dwell_seconds: row.stddev_dwell_seconds as number | null,
        });
      }
    }
  }

  // 5. Afinidad histórica de pares de clientes (PRD 26 Fase 4) — solo se
  // necesita si se va a construir la matriz de costo ponderada.
  const pairAffinity = new Map<string, number>(); // key: `${a}|${b}` con a<b
  if (useWeightedMatrix && planOrgId && customerIds.length > 1) {
    const { data: pairs, error: pairsErr } = await supabase
      .from('customer_pair_affinity')
      .select('customer_id_a, customer_id_b, co_occurrence_count')
      .eq('org_id', planOrgId)
      .in('customer_id_a', customerIds)
      .in('customer_id_b', customerIds);
    if (pairsErr) {
      console.warn('[vroom] failed_to_load_customer_pair_affinity', pairsErr.message);
    } else {
      for (const row of pairs ?? []) {
        pairAffinity.set(`${row.customer_id_a}|${row.customer_id_b}`, row.co_occurrence_count as number);
      }
    }
  }

  // Índice de skills (string → int) compartido por vehicles y jobs de esta
  // request. Solo hace falta que sea consistente dentro de esta llamada.
  const skillIndex = buildSkillIndex([
    ...routes.map((r) => (r.vehicle as unknown as Record<string, unknown> | null)?.skills as string[] | null),
    ...usableStops.map((ps) => {
      const psSkills = ps.required_skills as string[] | null;
      if (psSkills && psSkills.length > 0) return psSkills;
      const stop = ps.stop as unknown as Record<string, unknown> | null;
      return (stop?.required_skills as string[] | null) ?? null;
    }),
  ]);

  // Si algún vehículo del plan tiene volumen configurado, todos los arrays de
  // capacity/delivery pasan a 2 dimensiones [peso, volumen_litros]. Si ninguno
  // lo usa, se mantiene el comportamiento actual de 1 sola dimensión — cero
  // riesgo de regresión para orgs que no configuran volumen.
  const anyVehicleHasVolume = routes.some(
    (r) => typeof (r.vehicle as unknown as Record<string, unknown> | null)?.volume_m3 === 'number',
  );

  // Mapeo UUID ↔ integer IDs para Vroom.
  const vehicleIdToRoute = new Map<number, { routeId: string; vehicleId: string }>();
  const jobIdToPlanStop = new Map<number, string>();
  const vehiclesMissingDepot: string[] = [];
  // Coordenadas de depot por vehículo — se necesitan de nuevo más abajo para
  // construir los puntos de la matriz OSRM cuando `weights` está activo.
  const vehicleDepotByVroomId = new Map<number, { lng: number; lat: number }>();
  // customer_id por job — insumo del sesgo histórico (Fase 4).
  const jobCustomerByVroomId = new Map<number, string>();
  // `vehicles.max_stops` es un techo duro operativo (ej. la camioneta no
  // entra más de N paquetes por vuelta). Se aplica DESPUÉS del bloque de
  // modos, como `min()` contra lo que calculen balance_stops/balance_time,
  // para que el modo nunca lo relaje.
  const configuredMaxStopsByVroomId = new Map<number, number>();

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
    const volumeM3 = v && typeof v.volume_m3 === 'number' ? v.volume_m3 : null;
    const tws = v ? parseTimeToSeconds(v.time_window_start as string | null) : null;
    const twe = v ? parseTimeToSeconds(v.time_window_end as string | null) : null;
    const pricePerKm = v && typeof v.price_per_km === 'number' && v.price_per_km > 0 ? v.price_per_km : null;
    const maxStopsConfigured = v && typeof v.max_stops === 'number' && v.max_stops > 0 ? v.max_stops : null;

    const vehicle: VroomVehicle = {
      id: vroomId,
      start: [depotLng, depotLat],
    };
    if (returnToDepot) vehicle.end = [depotLng, depotLat];
    if (anyVehicleHasVolume) {
      vehicle.capacity = [
        capacityKg !== null && capacityKg > 0 ? Math.round(capacityKg) : UNBOUNDED_CAPACITY,
        volumeM3 !== null ? Math.round(volumeM3 * 1000) : UNBOUNDED_CAPACITY,
      ];
    } else if (capacityKg !== null && capacityKg > 0) {
      vehicle.capacity = [Math.round(capacityKg)];
    }
    if (tws !== null && twe !== null && twe > tws) vehicle.time_window = [tws, twe];
    vehicle.skills = toVroomSkills(v?.skills as string[] | null, skillIndex);
    // `per_km` requiere Vroom >= 1.14 (ver PRD 26 §Riesgos); se envía igual —
    // si el binario desplegado lo ignora, no debería romper la request.
    if (pricePerKm !== null) vehicle.costs = { per_km: Math.round(pricePerKm) };
    if (maxStopsConfigured !== null) configuredMaxStopsByVroomId.set(vroomId, maxStopsConfigured);
    vehicleDepotByVroomId.set(vroomId, { lng: depotLng, lat: depotLat });
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
  // Los bloques de modo hacen MERGE sobre `v.costs` (no reemplazo) para no
  // pisar el `per_km` ya seteado desde `vehicles.price_per_km` en el loop
  // de construcción de vehículos.
  //
  // Si `weights` está activo (PRD 26 Fase 2), los 5 presets de modo se
  // ignoran por completo: el objetivo lo define la matriz de costo propia,
  // no `costs.fixed`/`per_hour`. Evita además el conflicto documentado de
  // Vroom: un `per_hour` no-default es incompatible con una matriz `costs`
  // custom (ver modo `on_time` abajo).
  if (!useWeightedMatrix && vroomVehicles.length > 0 && usableStops.length > 0) {
    if (mode === 'efficiency') {
      // fixed=1200 (20min) → solo abre un vehículo extra si ahorra ≥20min de
      // viaje agregado. Default per_hour ya minimiza tiempo total.
      for (const v of vroomVehicles) v.costs = { ...v.costs, fixed: 1200 };
    } else if (mode === 'consolidate') {
      // fixed alto + minimize_vehicles fuerza concentración real. La flag
      // se aplica más abajo en `vroomPayload.options`.
      //
      // 86400 = 24h equivalentes en el modelo de costo de Vroom (per_hour
      // default = 3600 u/h). Tiene que ser mayor que cualquier ahorro de
      // viaje creíble por usar un camión extra; con 18000 (5h) no alcanzaba:
      // en planes de 30+ paradas el ahorro de driving por partir en 2 rutas
      // superaba esas 5h y Vroom seguía abriendo el 2do vehículo.
      for (const v of vroomVehicles) v.costs = { ...v.costs, fixed: 86400 };
    } else if (mode === 'balance_stops' || mode === 'balance_time') {
      // max_tasks=ceil(N/V) hace inviable la solución con V-1 vehículos, así
      // que Vroom se ve forzado a usar todos.
      // fixed=0 saca la presión de "menos vehículos = más barato", para que el
      // solver no consolide cuando podría repartir.
      for (const v of vroomVehicles) v.costs = { ...v.costs, fixed: 0 };
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
      //      OJO: un `per_hour` no-default es incompatible con una matriz de
      //      costo custom (Vroom tira error) — si en el futuro (PRD 26 Fase 2)
      //      se agrega `matrices.costs`, este modo hay que rediseñarlo.
      for (const v of vroomVehicles) v.costs = { ...v.costs, fixed: 600, per_hour: 360 };
    }
  }

  // `vehicles.max_stops` es un techo duro operativo — nunca se relaja por el
  // modo, así que se aplica DESPUÉS como min() contra el max_tasks calculado
  // arriba (si lo hay).
  for (const v of vroomVehicles) {
    const configured = configuredMaxStopsByVroomId.get(v.id);
    if (configured === undefined) continue;
    v.max_tasks = v.max_tasks !== undefined ? Math.min(v.max_tasks, configured) : configured;
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
    // Volumen sigue el mismo patrón que peso: real desde orders, fallback a
    // plan_stops.volume_m3 (mergeado por assign_orders_to_plan). `stops` no
    // tiene columna de volumen — solo existe a nivel plan_stops/vehicles.
    const orderVolume = orderVolumeByPlanStop.get(ps.id as string);
    const volumeM3 = orderVolume && orderVolume > 0
      ? orderVolume
      : (ps.volume_m3 as number | null);
    const tws = parseTimeToSeconds(stop.time_window_start as string | null);
    const twe = parseTimeToSeconds(stop.time_window_end as string | null);

    // priority/required_skills: `plan_stops` trae el valor ya mergeado por
    // `assign_orders_to_plan` (greatest/unión con el stop); si el plan_stop
    // no vino de ese flujo (asignación manual), cae a `stops` directamente.
    const psPriority = (ps.priority as number | null) ?? 0;
    const stopPriority = (stop.priority as number | null) ?? 0;
    const priority10 = psPriority > 0 ? psPriority : stopPriority; // rango Vuoo: 0–10

    const psSkills = ps.required_skills as string[] | null;
    const effectiveSkills = psSkills && psSkills.length > 0
      ? psSkills
      : (stop.required_skills as string[] | null);

    const customerId = stop.customer_id as string | null;
    if (customerId) jobCustomerByVroomId.set(vroomId, customerId);
    // Dwell time real aprendido (PRD 26 Fase 3), con gate de confianza —
    // reemplaza el estimado manual solo si hay suficiente muestra y poca
    // variabilidad. Aplica siempre, independiente de `weights`.
    const effectiveMinutes = effectiveServiceMinutes(
      customerId ? serviceStatsByCustomer.get(customerId) : undefined,
      durationMin,
    );

    const job: VroomJob = {
      id: vroomId,
      location: [lng, lat],
      service: Math.max(0, Math.round(effectiveMinutes * 60)),
    };
    if (anyVehicleHasVolume) {
      const w = weightKg !== null && weightKg > 0 ? Math.round(weightKg) : 0;
      const vol = volumeM3 !== null && volumeM3 > 0 ? Math.round(volumeM3 * 1000) : 0;
      job.delivery = [w, vol];
    } else if (weightKg !== null && weightKg > 0) {
      job.delivery = [Math.round(weightKg)];
    }
    if (tws !== null && twe !== null && twe > tws) job.time_windows = [[tws, twe]];
    if (priority10 > 0) job.priority = Math.min(100, priority10 * 10); // Vroom espera 0–100
    job.skills = toVroomSkills(effectiveSkills, skillIndex);
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

  // PRD 26 Fase 2: matriz de costo ponderada. Solo se activa si `weights`
  // vino en el body — si no, Vroom sigue armando su propia matriz
  // internamente vía el OSRM_HOST configurado en
  // `vuoo-routing/vroom/config.yml` (comportamiento de siempre).
  let matrices: Record<string, unknown> | undefined;
  if (useWeightedMatrix) {
    // Un punto por vehículo (start; mismo índice para end si vuelve al
    // depot) + un punto por job, en ese orden. Vroom exige *_index cuando
    // se manda una matriz propia — location queda solo para que la
    // respuesta traiga coordenadas legibles.
    const points: Array<{ lng: number; lat: number }> = [];
    for (const v of vroomVehicles) {
      const depot = vehicleDepotByVroomId.get(v.id)!;
      const pointIdx = points.push(depot) - 1;
      v.start_index = pointIdx;
      if (returnToDepot) v.end_index = pointIdx;
    }
    for (const j of vroomJobs) {
      const pointIdx = points.push({ lng: j.location[0], lat: j.location[1] }) - 1;
      j.location_index = pointIdx;
    }

    const table = await fetchOsrmTable(points);

    const wTime = weights?.time ?? 1;
    const wDist = weights?.distance ?? 0;
    const wHist = weights?.history ?? 0;

    // Sin historial todavía (org nueva / recién instrumentada), no hay
    // señal que aplicar — se omite el término en vez de penalizar todo por
    // igual (que además rompería la simetría entre pares con/sin
    // customer_id sin aportar ningún sesgo real).
    const hasHistoricalData = pairAffinity.size > 0;
    const maxCoOccurrence = hasHistoricalData ? Math.max(...Array.from(pairAffinity.values())) : 1;
    const pointToJobId = new Map<number, number>();
    for (const j of vroomJobs) pointToJobId.set(j.location_index!, j.id);

    function historyPenaltySeconds(pointA: number, pointB: number): number {
      if (wHist <= 0 || !hasHistoricalData) return 0;
      const jobIdA = pointToJobId.get(pointA);
      const jobIdB = pointToJobId.get(pointB);
      if (jobIdA === undefined || jobIdB === undefined) return 0; // punto de depot, no de job
      const custA = jobCustomerByVroomId.get(jobIdA);
      const custB = jobCustomerByVroomId.get(jobIdB);
      if (!custA || !custB || custA === custB) return 0;
      const [a, b] = custA < custB ? [custA, custB] : [custB, custA];
      const familiarity = (pairAffinity.get(`${a}|${b}`) ?? 0) / maxCoOccurrence;
      return (1 - familiarity) * MAX_HISTORY_PENALTY_SECONDS * wHist;
    }

    const n = points.length;
    const costs: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j2 = 0; j2 < n; j2++) {
        if (i === j2) continue;
        const base =
          wTime * table.durations[i][j2] + (wDist * table.distances[i][j2]) / REFERENCE_SPEED_MPS;
        costs[i][j2] = Math.max(0, Math.round(base + historyPenaltySeconds(i, j2)));
      }
    }

    matrices = { car: { durations: table.durations, distances: table.distances, costs } };
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
  if (matrices) vroomPayload.matrices = matrices;

  console.log(`[vroom][${mode}] sending`, JSON.stringify({
    plan_id: planId,
    mode,
    weights_active: useWeightedMatrix,
    vehicles: vroomVehicles.map((v) => ({
      id: v.id,
      capacity: v.capacity,
      skills: v.skills,
      time_window: v.time_window,
      max_tasks: v.max_tasks,
      max_travel_time: v.max_travel_time,
      costs: v.costs,
    })),
    jobs_count: vroomJobs.length,
    jobs_total_weight: vroomJobs.reduce((s, j) => s + (j.delivery?.[0] ?? 0), 0),
    jobs_with_tw: vroomJobs.filter((j) => j.time_windows && j.time_windows.length > 0).length,
    jobs_with_priority: vroomJobs.filter((j) => (j.priority ?? 0) > 0).length,
    jobs_with_skills: vroomJobs.filter((j) => j.skills && j.skills.length > 0).length,
    capacity_dimensions: anyVehicleHasVolume ? 2 : 1,
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
