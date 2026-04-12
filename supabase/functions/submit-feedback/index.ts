// supabase/functions/submit-feedback/index.ts
//
// Endpoint publico (sin auth). El cliente final envia una calificacion
// de su entrega usando el tracking_token.
//
// Body esperado:
//   {
//     token: string,       // tracking_token del plan_stop
//     rating: number,      // 1-5
//     comment?: string
//   }
//
// Requiere:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY

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

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Missing server configuration' }, 500)
    }

    // 1. Parse body
    const body = await req.json().catch(() => null)
    if (!body) {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const { token, rating, comment } = body as {
      token?: string
      rating?: number
      comment?: string
    }

    if (!token) {
      return jsonResponse({ error: 'token is required' }, 400)
    }

    if (rating === undefined || rating === null || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return jsonResponse({ error: 'rating must be an integer between 1 and 5' }, 400)
    }

    // 2. Admin client (bypasses RLS)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // 3. Look up plan_stop by tracking_token
    const { data: planStop, error: planStopError } = await adminClient
      .from('plan_stops')
      .select(`
        id,
        status,
        org_id,
        route:routes (
          driver_id
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

    // 4. Verify plan_stop is completed
    if (planStop.status !== 'completed') {
      return jsonResponse(
        { error: 'Feedback can only be submitted for completed deliveries' },
        400,
      )
    }

    // 5. Check for existing feedback (prevent duplicates)
    const { data: existingFeedback } = await adminClient
      .from('delivery_feedback')
      .select('id')
      .eq('plan_stop_id', planStop.id)
      .maybeSingle()

    if (existingFeedback) {
      return jsonResponse(
        { error: 'Feedback has already been submitted for this delivery' },
        409,
      )
    }

    // 6. Get driver_id from route
    const route = planStop.route as Record<string, unknown> | null
    const driverId = route?.driver_id as string | null

    // 7. Insert feedback
    const { error: insertError } = await adminClient
      .from('delivery_feedback')
      .insert({
        org_id: planStop.org_id,
        plan_stop_id: planStop.id,
        driver_id: driverId,
        rating,
        comment: comment ?? null,
      })

    if (insertError) {
      return jsonResponse(
        { error: 'Error saving feedback', details: insertError.message },
        500,
      )
    }

    return jsonResponse({ success: true }, 200)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonResponse({ error: 'Internal error', details: message }, 500)
  }
})
