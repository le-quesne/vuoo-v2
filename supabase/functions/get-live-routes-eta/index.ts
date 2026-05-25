// supabase/functions/get-live-routes-eta/index.ts
//
// Endpoint autenticado para la Torre de Control. Recibe { orgId, date }
// y devuelve, por cada ruta activa o no iniciada del dia, el ETA de la
// proxima parada pendiente y el ETA de la ultima parada pendiente.
//
// Dos modos de calculo por ruta:
//   - "live": el conductor reporto ubicacion reciente. Se llama a Mapbox
//     Directions desde driver_location -> [pending_stops_in_order]. El
//     ETA proxima parada es leg[0].duration. El ETA final suma todos
//     los legs + el service_duration de las paradas intermedias (sin
//     contar la ultima).
//   - "plan": no hay ubicacion reciente (offline o ruta no iniciada).
//     Se usa vehicle.time_window_start del dia + total_duration_minutes
//     del plan, repartido proporcionalmente entre paradas pendientes.
//
// Requiere:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - SUPABASE_ANON_KEY (para verificar JWT del caller)
//   - MAPBOX_TOKEN (para Directions API)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ONLINE_THRESHOLD_MS = 5 * 60_000 // 5 min: tolerante respecto al panel (1 min)

interface RequestBody {
  orgId?: string
  date?: string
}

interface PendingStop {
  planStopId: string
  lat: number
  lng: number
  serviceMinutes: number
}

interface RouteEta {
  nextEta: string | null
  finalEta: string | null
  source: 'live' | 'plan' | 'none'
}

type EtaResponse = { etas: Record<string, RouteEta> }

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function buildPlannedStart(date: string, timeOfDay: string | null): number | null {
  if (!timeOfDay) return null
  // date: YYYY-MM-DD, timeOfDay: HH:MM:SS
  const ts = Date.parse(`${date}T${timeOfDay}`)
  return Number.isFinite(ts) ? ts : null
}

async function mapboxLegDurations(
  token: string,
  origin: { lat: number; lng: number },
  stops: PendingStop[],
): Promise<number[] | null> {
  const coords: Array<[number, number]> = [[origin.lng, origin.lat]]
  for (const s of stops) coords.push([s.lng, s.lat])
  if (coords.length < 2) return null

  const coordStr = coords.map(([lng, lat]) => `${lng},${lat}`).join(';')
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}` +
    `?access_token=${token}&overview=false`

  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const legs = data?.routes?.[0]?.legs as Array<{ duration?: number }> | undefined
    if (!Array.isArray(legs) || legs.length === 0) return null
    return legs.map((l) => Number(l?.duration ?? 0))
  } catch {
    return null
  }
}

function computeLiveEta(
  nowMs: number,
  pending: PendingStop[],
  legDurationsSeconds: number[],
): { nextEta: string; finalEta: string } | null {
  if (pending.length === 0 || legDurationsSeconds.length === 0) return null

  const firstLeg = legDurationsSeconds[0] ?? 0
  const nextEta = new Date(nowMs + firstLeg * 1000).toISOString()

  // sum all legs + service time of intermediate pending stops (no la ultima)
  const drivingTotal = legDurationsSeconds.reduce((acc, d) => acc + d, 0)
  let serviceTotal = 0
  for (let i = 0; i < pending.length - 1; i++) {
    serviceTotal += (pending[i].serviceMinutes ?? 5) * 60
  }
  const finalEta = new Date(nowMs + (drivingTotal + serviceTotal) * 1000).toISOString()
  return { nextEta, finalEta }
}

function computePlanEta(
  nowMs: number,
  plannedStartMs: number | null,
  totalDurationMinutes: number | null,
  pendingCount: number,
  totalStops: number,
): { nextEta: string; finalEta: string } | null {
  if (totalStops <= 0 || pendingCount <= 0) return null
  const totalMin = totalDurationMinutes ?? 0
  if (totalMin <= 0) return null

  // Anchor: si la hora planificada aun no llega, usar planned_start.
  // Si ya paso (o no hay), usar now.
  const anchorMs = plannedStartMs && plannedStartMs > nowMs ? plannedStartMs : nowMs
  const avgMs = (totalMin * 60_000) / totalStops
  const nextEta = new Date(anchorMs + avgMs).toISOString()
  const finalEta = new Date(anchorMs + avgMs * pendingCount).toISOString()
  return { nextEta, finalEta }
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
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const mapboxToken = Deno.env.get('MAPBOX_TOKEN')

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: 'Missing server configuration' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401)
    }

    // Verificar JWT del caller (no service_role para este endpoint)
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser()
    if (callerError || !caller) {
      return jsonResponse({ error: 'Invalid token' }, 401)
    }

    const body = (await req.json().catch(() => ({}))) as RequestBody
    const orgId = body.orgId
    const date = body.date
    if (!orgId || !date) {
      return jsonResponse({ error: 'orgId y date son requeridos' }, 400)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Verificar membresia del caller en el org
    const { data: membership } = await adminClient
      .from('organization_members')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('user_id', caller.id)
      .maybeSingle()
    if (!membership) {
      return jsonResponse({ error: 'No autorizado para esta organizacion' }, 403)
    }

    // 1. Rutas del dia (activas o sin iniciar) con vehiculo
    const { data: routes, error: routesError } = await adminClient
      .from('routes')
      .select(`
        id,
        driver_id,
        status,
        total_duration_minutes,
        plan:plans!inner ( id, date ),
        vehicle:vehicles ( time_window_start )
      `)
      .eq('org_id', orgId)
      .eq('plan.date', date)
      .in('status', ['in_transit', 'not_started'])

    if (routesError) {
      return jsonResponse({ error: routesError.message }, 500)
    }

    const out: Record<string, RouteEta> = {}
    if (!routes || routes.length === 0) {
      return jsonResponse({ etas: out } as EtaResponse)
    }

    const routeIds = routes.map((r) => r.id as string)

    // 2. plan_stops pendientes con stop.lat/lng/duration_minutes
    const { data: planStops, error: stopsError } = await adminClient
      .from('plan_stops')
      .select(`
        id,
        route_id,
        status,
        order_index,
        stop:stops ( lat, lng, duration_minutes )
      `)
      .in('route_id', routeIds)
      .order('order_index', { ascending: true })

    if (stopsError) {
      return jsonResponse({ error: stopsError.message }, 500)
    }

    const pendingByRoute = new Map<string, PendingStop[]>()
    const totalByRoute = new Map<string, number>()
    for (const ps of planStops ?? []) {
      const routeId = ps.route_id as string
      totalByRoute.set(routeId, (totalByRoute.get(routeId) ?? 0) + 1)
      if (ps.status !== 'pending') continue
      const stop = ps.stop as { lat?: number | null; lng?: number | null; duration_minutes?: number | null } | null
      if (!stop || stop.lat == null || stop.lng == null) continue
      const list = pendingByRoute.get(routeId) ?? []
      list.push({
        planStopId: ps.id as string,
        lat: Number(stop.lat),
        lng: Number(stop.lng),
        serviceMinutes: Number(stop.duration_minutes ?? 5),
      })
      pendingByRoute.set(routeId, list)
    }

    // 3. Latest driver_location por ruta (segunda query, agrupada)
    const driverRouteMap = new Map<string, { driverId: string; routeId: string }>()
    for (const r of routes) {
      if (r.driver_id) driverRouteMap.set(r.id as string, { driverId: r.driver_id as string, routeId: r.id as string })
    }

    const lastLocByRoute = new Map<string, { lat: number; lng: number; recordedAt: string }>()
    if (driverRouteMap.size > 0) {
      const driverIds = [...new Set([...driverRouteMap.values()].map((d) => d.driverId))]
      // Trae las ultimas 50 ubicaciones por conductor; reducimos en JS.
      const { data: locs } = await adminClient
        .from('driver_locations')
        .select('driver_id, route_id, lat, lng, recorded_at')
        .in('driver_id', driverIds)
        .order('recorded_at', { ascending: false })
        .limit(driverIds.length * 5)

      const seenRoute = new Set<string>()
      for (const l of locs ?? []) {
        const rid = (l.route_id as string | null) ?? null
        if (!rid || seenRoute.has(rid)) continue
        seenRoute.add(rid)
        lastLocByRoute.set(rid, {
          lat: Number(l.lat),
          lng: Number(l.lng),
          recordedAt: l.recorded_at as string,
        })
      }
    }

    const nowMs = Date.now()

    // 4. Por cada ruta, calcular ETAs
    for (const r of routes) {
      const routeId = r.id as string
      const pending = pendingByRoute.get(routeId) ?? []
      const totalStops = totalByRoute.get(routeId) ?? 0
      const pendingCount = pending.length

      if (pendingCount === 0) {
        out[routeId] = { nextEta: null, finalEta: null, source: 'none' }
        continue
      }

      const lastLoc = lastLocByRoute.get(routeId)
      const lastLocAgeMs = lastLoc ? nowMs - Date.parse(lastLoc.recordedAt) : Infinity
      const isOnline = lastLoc && lastLocAgeMs <= ONLINE_THRESHOLD_MS

      let eta: { nextEta: string; finalEta: string } | null = null
      let source: RouteEta['source'] = 'plan'

      if (mapboxToken && isOnline && lastLoc) {
        const legs = await mapboxLegDurations(mapboxToken, lastLoc, pending)
        if (legs) {
          eta = computeLiveEta(nowMs, pending, legs)
          source = 'live'
        }
      }

      if (!eta) {
        const vehicle = r.vehicle as { time_window_start?: string | null } | null
        const plan = r.plan as { date?: string } | null
        const plannedStartMs = buildPlannedStart(
          (plan?.date as string | undefined) ?? date,
          vehicle?.time_window_start ?? null,
        )
        eta = computePlanEta(
          nowMs,
          plannedStartMs,
          (r.total_duration_minutes as number | null) ?? null,
          pendingCount,
          totalStops,
        )
        source = 'plan'
      }

      out[routeId] = eta
        ? { nextEta: eta.nextEta, finalEta: eta.finalEta, source }
        : { nextEta: null, finalEta: null, source: 'none' }
    }

    return jsonResponse({ etas: out } as EtaResponse)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Internal error'
    return jsonResponse({ error: message }, 500)
  }
})
