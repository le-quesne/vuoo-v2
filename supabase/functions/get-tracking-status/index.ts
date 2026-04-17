// supabase/functions/get-tracking-status/index.ts
//
// Endpoint publico (sin auth). Recibe un tracking_token y devuelve
// el estado de la entrega junto con info del conductor, ETA, POD
// y branding de la organizacion.
//
// Query param: ?token=UUID
//
// Requiere:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - MAPBOX_TOKEN (para calcular ETA con Directions API)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Missing server configuration' }, 500)
    }

    // 1. Parse tracking token from query params
    const url = new URL(req.url)
    const token = url.searchParams.get('token')

    if (!token) {
      return jsonResponse({ error: 'Missing token parameter' }, 400)
    }

    // 2. Admin client (bypasses RLS)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // 3. Look up plan_stop by tracking_token, join stop, route, driver, vehicle
    const { data: planStop, error: planStopError } = await adminClient
      .from('plan_stops')
      .select(`
        id,
        status,
        order_index,
        route_id,
        report_images,
        report_signature_url,
        report_time,
        report_location,
        notification_preferences,
        org_id,
        stop:stops (
          address,
          lat,
          lng,
          time_window_start,
          time_window_end,
          customer_name,
          delivery_instructions
        ),
        route:routes (
          id,
          status,
          driver_id,
          driver:drivers (
            first_name
          ),
          vehicle:vehicles (
            license_plate
          )
        )
      `)
      .eq('tracking_token', token)
      .maybeSingle()

    if (planStopError) {
      return jsonResponse(
        { error: 'Error looking up delivery', details: planStopError.message },
        500,
      )
    }

    if (!planStop) {
      return jsonResponse({ error: 'Delivery not found' }, 404)
    }

    // 4. Get org info + notification settings (branding)
    const { data: orgData } = await adminClient
      .from('organizations')
      .select('name')
      .eq('id', planStop.org_id)
      .single()

    const { data: orgSettings } = await adminClient
      .from('org_notification_settings')
      .select('logo_url, primary_color, arriving_stops_threshold')
      .eq('org_id', planStop.org_id)
      .maybeSingle()

    const arrivingThreshold = orgSettings?.arriving_stops_threshold ?? 3

    // 5. Determine status
    const stop = planStop.stop as Record<string, unknown>
    const route = planStop.route as Record<string, unknown> | null

    let trackingStatus: string

    if (planStop.status === 'completed') {
      trackingStatus = 'delivered'
    } else if (planStop.status === 'cancelled' || planStop.status === 'incomplete') {
      trackingStatus = 'failed'
    } else if (route && route.status === 'in_transit') {
      // Get all route stops to find position of this stop
      const { data: routeStopsForStatus } = await adminClient
        .from('plan_stops')
        .select('id, status')
        .eq('route_id', planStop.route_id)
        .order('order_index', { ascending: true })

      const posIdx = routeStopsForStatus?.findIndex((ps) => ps.id === planStop.id) ?? -1
      const pendingBefore = posIdx > 0
        ? (routeStopsForStatus?.slice(0, posIdx).filter((ps) => ps.status === 'pending').length ?? 0)
        : 0

      if (pendingBefore <= arrivingThreshold) {
        trackingStatus = 'arriving'
      } else {
        trackingStatus = 'in_transit'
      }
    } else {
      trackingStatus = 'scheduled'
    }

    // 6. Get driver location + calculate real ETA
    let eta: { estimated_arrival: string | null; stops_before: number } | null = null
    let location: { lat: number; lng: number; updated_at: string } | null = null

    if (route && route.status === 'in_transit' && planStop.status === 'pending' && route.driver_id) {
      // 6a. Get latest driver location
      const { data: latestLocation } = await adminClient
        .from('driver_locations')
        .select('lat, lng, recorded_at')
        .eq('route_id', route.id as string)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestLocation) {
        location = {
          lat: latestLocation.lat,
          lng: latestLocation.lng,
          updated_at: latestLocation.recorded_at,
        }
      }

      // 6b. Get ALL plan_stops in this route ordered by sequence
      //     Then find this stop's position and count pending stops before it
      const { data: allRouteStops } = await adminClient
        .from('plan_stops')
        .select(`
          id,
          status,
          order_index,
          stop:stops (
            lat,
            lng,
            duration_minutes
          )
        `)
        .eq('route_id', planStop.route_id)
        .order('order_index', { ascending: true })

      // Find this stop's position in the route by array index (more robust than order_index comparison)
      const thisIdx = allRouteStops?.findIndex((ps) => ps.id === planStop.id) ?? -1

      // Pending stops BEFORE this one in sequence
      const stopsBeforeList = thisIdx > 0
        ? (allRouteStops?.slice(0, thisIdx).filter((ps) => ps.status === 'pending') ?? [])
        : []
      const stopsBefore = stopsBeforeList.length

      // For ETA: pending stops up to and including this one
      const pendingStops = thisIdx >= 0
        ? (allRouteStops?.slice(0, thisIdx + 1).filter(
            (ps) => ps.status === 'pending',
          ) ?? [])
        : []

      // 6c. Calculate ETA using Mapbox Directions API
      let estimatedArrival: string | null = null
      const mapboxToken = Deno.env.get('MAPBOX_TOKEN')

      if (mapboxToken && latestLocation && pendingStops && pendingStops.length > 0) {
        // Build coordinate list: driver_location → each pending stop in order
        const coords: [number, number][] = [
          [latestLocation.lng, latestLocation.lat],
        ]
        let totalStopDuration = 0

        for (const ps of pendingStops) {
          const s = ps.stop as Record<string, unknown>
          const sLat = s.lat as number | null
          const sLng = s.lng as number | null
          if (sLat && sLng) {
            coords.push([sLng, sLat])
            // Add duration_minutes for intermediate stops (not the final destination)
            if (ps.id !== planStop.id) {
              totalStopDuration += ((s.duration_minutes as number) ?? 5) * 60 // to seconds
            }
          }
        }

        if (coords.length >= 2) {
          try {
            const coordStr = coords.map(([lng, lat]) => `${lng},${lat}`).join(';')
            const directionsUrl =
              `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}` +
              `?access_token=${mapboxToken}&overview=false`

            const dirResponse = await fetch(directionsUrl)
            const dirData = await dirResponse.json()
            const routeDuration = dirData?.routes?.[0]?.duration // seconds

            if (routeDuration != null) {
              const totalSeconds = routeDuration + totalStopDuration
              const arrivalTime = new Date(Date.now() + totalSeconds * 1000)
              estimatedArrival = arrivalTime.toISOString()
            }
          } catch {
            // Directions API failed, fall back to null ETA
          }
        }
      }

      eta = {
        estimated_arrival: estimatedArrival,
        stops_before: stopsBefore,
      }
    }

    // 8. Get POD data if delivered
    let pod: {
      photos: string[]
      signature_url: string | null
      completed_at: string | null
      location: string | null
    } | null = null

    if (trackingStatus === 'delivered') {
      // Generate signed URLs for report images
      const photos: string[] = []
      const reportImages = planStop.report_images as string[] | null

      if (reportImages && reportImages.length > 0) {
        for (const imagePath of reportImages) {
          const { data: signedUrl } = await adminClient.storage
            .from('delivery-photos')
            .createSignedUrl(imagePath, 3600) // 1 hour expiry

          if (signedUrl?.signedUrl) {
            photos.push(signedUrl.signedUrl)
          }
        }
      }

      // Generate signed URL for signature
      let signatureUrl: string | null = null
      if (planStop.report_signature_url) {
        const { data: signedSig } = await adminClient.storage
          .from('signatures')
          .createSignedUrl(planStop.report_signature_url as string, 3600)

        if (signedSig?.signedUrl) {
          signatureUrl = signedSig.signedUrl
        }
      }

      pod = {
        photos,
        signature_url: signatureUrl,
        completed_at: planStop.report_time as string | null,
        location: planStop.report_location as string | null,
      }
    }

    // 8.5 Notification timeline (last 10 events for this plan_stop)
    // Sólo channel/event/status/sent_at — sin PII del recipient.
    const { data: notifRows } = await adminClient
      .from('notification_logs')
      .select('id, channel, event_type, status, sent_at, created_at')
      .eq('plan_stop_id', planStop.id)
      .order('created_at', { ascending: false })
      .limit(10)

    const notifications = (notifRows ?? []).map((n) => ({
      id: n.id as string,
      channel: n.channel as string,
      event_type: n.event_type as string,
      status: n.status as string,
      sent_at: (n.sent_at ?? n.created_at) as string,
    }))

    // 9. Build driver info
    const driver = route?.driver
      ? {
          first_name: (route.driver as Record<string, unknown>).first_name as string,
          vehicle_plate: route.vehicle
            ? ((route.vehicle as Record<string, unknown>).license_plate as string | null)
            : null,
        }
      : null

    // 10. Build response
    const response = {
      status: trackingStatus,
      stop: {
        address: stop.address as string,
        time_window_start: stop.time_window_start as string | null,
        time_window_end: stop.time_window_end as string | null,
        customer_name: stop.customer_name as string | null,
        delivery_instructions: stop.delivery_instructions as string | null,
      },
      driver,
      eta,
      location,
      pod,
      org: {
        name: orgData?.name ?? '',
        logo_url: orgSettings?.logo_url ?? null,
        primary_color: orgSettings?.primary_color ?? '#6366f1',
      },
      route_id: planStop.route_id ?? null,
      stop_lat: (stop.lat as number) ?? null,
      stop_lng: (stop.lng as number) ?? null,
      notifications,
    }

    return jsonResponse(response, 200)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonResponse({ error: 'Internal error', details: message }, 500)
  }
})
