// supabase/functions/optimize-routes-vroom/index.ts
//
// Optimiza las paradas de un plan usando Vroom (self-hosted en Railway).
// A diferencia de Mapbox Optimization (solo TSP single-vehicle), Vroom maneja:
//   - Multi-vehiculo con capacidades distintas
//   - Time windows por parada y por vehiculo
//   - Duracion de servicio por parada
//   - Rebalanceo automatico entre rutas
//
// Body (POST JSON):
//   { plan_id: UUID }
//
// El depot de cada vehiculo se resuelve en el servidor:
//   vehicles.depot_lat/lng  (override por camion)  → fallback a
//   organizations.default_depot_lat/lng  (default de la org)
//
// Response:
//   {
//     summary: { cost, routes, unassigned, duration },
//     routes: [
//       { route_id, vehicle_id, total_duration, ordered_plan_stop_ids: [uuid, ...] }
//     ],
//     unassigned: [{ plan_stop_id, reason }]
//   }
//
// Requiere env:
//   - SUPABASE_URL
//   - SUPABASE_ANON_KEY (el cliente usa el JWT del caller, RLS aplica)
//   - VROOM_URL (ej: https://vroom-production-aae0.up.railway.app)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// "HH:MM" or "HH:MM:SS" -> seconds since midnight. null if invalid.
function parseTimeToSeconds(value: string | null | undefined): number | null {
  if (!value) return null
  const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return null
  const h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10)
  const s = match[3] ? parseInt(match[3], 10) : 0
  if (h > 23 || m > 59 || s > 59) return null
  return h * 3600 + m * 60 + s
}

type VroomVehicle = {
  id: number
  start: [number, number]
  end?: [number, number]
  capacity?: number[]
  time_window?: [number, number]
  max_tasks?: number
  max_travel_time?: number
}

type VroomJob = {
  id: number
  location: [number, number]
  service?: number
  delivery?: number[]
  time_windows?: [number, number][]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const vroomUrl = Deno.env.get('VROOM_URL')

    if (!supabaseUrl || !anonKey || !vroomUrl) {
      return jsonResponse({ error: 'Missing server configuration' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization' }, 401)
    }

    const body = await req.json().catch(() => null) as
      | {
          plan_id?: string
          mode?: 'efficiency' | 'balance_stops' | 'balance_time' | 'consolidate'
          return_to_depot?: boolean
        }
      | null
    const planId = body?.plan_id
    const mode = body?.mode ?? 'efficiency'
    const returnToDepot = body?.return_to_depot !== false

    if (!planId) {
      return jsonResponse({ error: 'Body must be { plan_id: UUID }' }, 400)
    }

    // Client with caller's JWT — RLS aplica
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Fetch plan_stops with stop data
    const { data: planStops, error: psErr } = await supabase
      .from('plan_stops')
      .select(`
        id,
        route_id,
        stop:stops (
          lat,
          lng,
          duration_minutes,
          weight_kg,
          time_window_start,
          time_window_end
        )
      `)
      .eq('plan_id', planId)
      .neq('status', 'completed')
      .neq('status', 'cancelled')

    if (psErr) {
      return jsonResponse({ error: 'Failed to load plan stops', details: psErr.message }, 500)
    }

    // Fetch plan's org default depot (used as fallback for vehicles without override)
    const { data: planRow, error: planErr } = await supabase
      .from('plans')
      .select(`
        org:organizations (
          default_depot_lat,
          default_depot_lng
        )
      `)
      .eq('id', planId)
      .maybeSingle()

    if (planErr) {
      return jsonResponse({ error: 'Failed to load plan', details: planErr.message }, 500)
    }

    const planOrg = (planRow?.org as Record<string, unknown> | null) ?? null
    const orgDefaultDepotLng = (planOrg?.default_depot_lng as number | null) ?? null
    const orgDefaultDepotLat = (planOrg?.default_depot_lat as number | null) ?? null

    // Fetch routes with vehicle data (per-vehicle depot override only)
    const { data: routes, error: rErr } = await supabase
      .from('routes')
      .select(`
        id,
        vehicle_id,
        vehicle:vehicles (
          capacity_weight_kg,
          time_window_start,
          time_window_end,
          depot_lat,
          depot_lng
        )
      `)
      .eq('plan_id', planId)

    if (rErr) {
      return jsonResponse({ error: 'Failed to load routes', details: rErr.message }, 500)
    }

    const usableStops = (planStops ?? []).filter((ps) => {
      const stop = ps.stop as Record<string, unknown> | null
      return stop && typeof stop.lat === 'number' && typeof stop.lng === 'number'
    })

    if (usableStops.length === 0) {
      return jsonResponse({ error: 'No stops with coordinates in plan' }, 400)
    }

    if (!routes || routes.length === 0) {
      return jsonResponse({ error: 'Plan has no routes/vehicles assigned' }, 400)
    }

    // Map UUID <-> integer IDs for Vroom
    const vehicleIdToRoute = new Map<number, { routeId: string; vehicleId: string }>()
    const jobIdToPlanStop = new Map<number, string>()
    const vehiclesMissingDepot: string[] = []

    const vroomVehicles: VroomVehicle[] = []
    for (let idx = 0; idx < routes.length; idx++) {
      const route = routes[idx]
      const vroomId = idx + 1
      const v = route.vehicle as Record<string, unknown> | null

      const depotLng = (v?.depot_lng as number | null) ?? orgDefaultDepotLng
      const depotLat = (v?.depot_lat as number | null) ?? orgDefaultDepotLat

      if (depotLng === null || depotLat === null) {
        vehiclesMissingDepot.push(route.vehicle_id as string)
        continue
      }

      vehicleIdToRoute.set(vroomId, {
        routeId: route.id as string,
        vehicleId: route.vehicle_id as string,
      })

      const capacityKg = v && typeof v.capacity_weight_kg === 'number' ? v.capacity_weight_kg : null
      const tws = v ? parseTimeToSeconds(v.time_window_start as string | null) : null
      const twe = v ? parseTimeToSeconds(v.time_window_end as string | null) : null

      const vehicle: VroomVehicle = {
        id: vroomId,
        start: [depotLng, depotLat],
      }
      if (returnToDepot) {
        vehicle.end = [depotLng, depotLat]
      }
      if (capacityKg !== null && capacityKg > 0) {
        vehicle.capacity = [Math.round(capacityKg)]
      }
      if (tws !== null && twe !== null && twe > tws) {
        vehicle.time_window = [tws, twe]
      }
      vroomVehicles.push(vehicle)
    }

    // Apply balancing modes AFTER we know how many vehicles survived depot check
    if (vroomVehicles.length > 0 && usableStops.length > 0) {
      if (mode === 'balance_stops') {
        const maxTasks = Math.ceil(usableStops.length / vroomVehicles.length)
        for (const v of vroomVehicles) v.max_tasks = maxTasks
      } else if (mode === 'balance_time' && vroomVehicles.length > 1) {
        // Heuristic: cap max_travel_time to distribute workload
        // First assume total_time ~= sum of vehicle time_windows, fallback to 8h
        const totalWindowSec = vroomVehicles.reduce((acc, v) => {
          if (v.time_window) return acc + (v.time_window[1] - v.time_window[0])
          return acc + 8 * 3600
        }, 0)
        const perVehicleCap = Math.ceil(totalWindowSec / vroomVehicles.length)
        for (const v of vroomVehicles) v.max_travel_time = perVehicleCap
      }
    }

    if (vroomVehicles.length === 0) {
      return jsonResponse(
        {
          error: 'No depot configured',
          message:
            'Configura un depot default en la organizacion (Settings) o por vehiculo antes de optimizar.',
          vehicles_missing_depot: vehiclesMissingDepot,
        },
        400,
      )
    }

    const vroomJobs: VroomJob[] = usableStops.map((ps, idx) => {
      const vroomId = idx + 1
      jobIdToPlanStop.set(vroomId, ps.id as string)
      const stop = ps.stop as Record<string, unknown>
      const lng = stop.lng as number
      const lat = stop.lat as number
      const durationMin = (stop.duration_minutes as number | null) ?? 5
      const weightKg = stop.weight_kg as number | null
      const tws = parseTimeToSeconds(stop.time_window_start as string | null)
      const twe = parseTimeToSeconds(stop.time_window_end as string | null)

      const job: VroomJob = {
        id: vroomId,
        location: [lng, lat],
        service: Math.max(0, Math.round(durationMin * 60)),
      }
      if (weightKg !== null && weightKg > 0) {
        job.delivery = [Math.round(weightKg)]
      }
      if (tws !== null && twe !== null && twe > tws) {
        job.time_windows = [[tws, twe]]
      }
      return job
    })

    // Call Vroom
    const vroomPayload: Record<string, unknown> = {
      vehicles: vroomVehicles,
      jobs: vroomJobs,
    }
    if (mode === 'consolidate') {
      vroomPayload.options = { minimize_vehicles: true }
    }
    const vroomRes = await fetch(vroomUrl.replace(/\/$/, '') + '/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vroomPayload),
    })

    if (!vroomRes.ok) {
      const text = await vroomRes.text()
      return jsonResponse(
        { error: 'Vroom request failed', status: vroomRes.status, details: text.slice(0, 500) },
        502,
      )
    }

    const vroomData = await vroomRes.json()

    if (vroomData.code !== 0) {
      return jsonResponse(
        { error: 'Vroom returned error', code: vroomData.code, details: vroomData.error ?? null },
        422,
      )
    }

    // Map Vroom response back to UUIDs
    const resultRoutes = (vroomData.routes ?? []).map((r: Record<string, unknown>) => {
      const mapping = vehicleIdToRoute.get(r.vehicle as number)
      const steps = (r.steps as Array<Record<string, unknown>>)
        .filter((step) => step.type === 'job')
        .map((step) => jobIdToPlanStop.get(step.job as number))
        .filter((v): v is string => typeof v === 'string')

      return {
        route_id: mapping?.routeId ?? null,
        vehicle_id: mapping?.vehicleId ?? null,
        total_duration: (r.duration as number) ?? 0,
        total_distance: (r.distance as number | undefined) ?? null,
        ordered_plan_stop_ids: steps,
      }
    })

    const unassigned = (vroomData.unassigned ?? []).map((u: Record<string, unknown>) => ({
      plan_stop_id: jobIdToPlanStop.get(u.id as number) ?? null,
      reason: (u.description as string | undefined) ?? 'unassigned',
    }))

    const summary = vroomData.summary as Record<string, unknown> | undefined

    return jsonResponse({
      summary: {
        cost: summary?.cost ?? 0,
        routes: summary?.routes ?? resultRoutes.length,
        unassigned: summary?.unassigned ?? unassigned.length,
        duration: summary?.duration ?? 0,
      },
      routes: resultRoutes,
      unassigned,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonResponse({ error: 'Internal error', details: message }, 500)
  }
})
