// supabase/functions/invite-driver/index.ts
//
// Invita a un conductor creando su auth user via magic link / invitacion
// y luego inserta el registro en la tabla drivers enlazado a ese user_id.
//
// Body esperado:
//   {
//     email: string,
//     first_name: string,
//     last_name: string,
//     org_id: string,
//     driver_data: Record<string, unknown>  // resto de campos del driver
//   }
//
// Requiere:
//   - SUPABASE_URL
//   - SUPABASE_ANON_KEY
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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Missing server configuration' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401)
    }

    // 1. Verificar JWT del caller usando anon + Authorization header
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser()

    if (callerError || !caller) {
      return jsonResponse({ error: 'Invalid token' }, 401)
    }

    // 2. Parsear body
    const body = await req.json().catch(() => null)
    if (!body) {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const { email, first_name, last_name, org_id, driver_data } = body as {
      email?: string
      first_name?: string
      last_name?: string
      org_id?: string
      driver_data?: Record<string, unknown>
    }

    if (!email || !first_name || !last_name || !org_id) {
      return jsonResponse(
        { error: 'email, first_name, last_name y org_id son requeridos' },
        400,
      )
    }

    // 3. Verificar que el caller sea miembro de la org
    const { data: membership, error: membershipError } = await callerClient
      .from('organization_members')
      .select('org_id, role')
      .eq('org_id', org_id)
      .eq('user_id', caller.id)
      .maybeSingle()

    if (membershipError) {
      return jsonResponse(
        { error: 'Error verificando membresia', details: membershipError.message },
        500,
      )
    }

    if (!membership) {
      return jsonResponse(
        { error: 'No autorizado: no eres miembro de esta organizacion' },
        403,
      )
    }

    // 4. Service role client para admin operations
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // 5. Invitar al conductor via email
    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        data: {
          first_name,
          last_name,
          role: 'driver',
        },
      })

    if (inviteError || !inviteData?.user) {
      return jsonResponse(
        {
          error: 'No se pudo invitar al conductor',
          details: inviteError?.message ?? 'Unknown error',
        },
        400,
      )
    }

    const newUser = inviteData.user

    // 6. Insertar driver con user_id = newUser.id y org_id
    const insertPayload = {
      ...(driver_data ?? {}),
      first_name,
      last_name,
      email,
      org_id,
      user_id: newUser.id,
    }

    const { data: driver, error: insertError } = await adminClient
      .from('drivers')
      .insert(insertPayload)
      .select('*')
      .single()

    if (insertError) {
      // Rollback best-effort: borrar el auth user recien creado
      await adminClient.auth.admin.deleteUser(newUser.id).catch(() => {})
      return jsonResponse(
        {
          error: 'No se pudo crear el conductor',
          details: insertError.message,
        },
        400,
      )
    }

    return jsonResponse({ driver }, 200)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonResponse({ error: 'Internal error', details: message }, 500)
  }
})
