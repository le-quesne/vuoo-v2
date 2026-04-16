// supabase/functions/invite-org-user/index.ts
//
// Invita un usuario del portal web (rol admin o member) creando su auth user
// via email y registrando la membresia en organization_members.
//
// Body esperado:
//   {
//     email: string,
//     first_name: string,
//     last_name: string,
//     org_id: string,
//     role?: 'admin' | 'member'    // default 'admin'
//     redirect_url?: string
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

    // Cliente con anon key + token del usuario: mandará apikey y Authorization
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData?.user) {
      return jsonResponse(
        { error: 'Invalid token', details: userError?.message ?? 'no user' },
        401,
      )
    }
    const callerId = userData.user.id

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const body = await req.json().catch(() => null)
    if (!body) {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const {
      email,
      first_name,
      last_name,
      org_id,
      role = 'admin',
      redirect_url,
    } = body as {
      email?: string
      first_name?: string
      last_name?: string
      org_id?: string
      role?: 'admin' | 'member'
      redirect_url?: string
    }

    if (!email || !first_name || !last_name || !org_id) {
      return jsonResponse(
        { error: 'email, first_name, last_name y org_id son requeridos' },
        400,
      )
    }

    if (role !== 'admin' && role !== 'member') {
      return jsonResponse({ error: 'role debe ser admin o member' }, 400)
    }

    // Caller debe ser owner o admin de la org
    const { data: callerMembership, error: membershipError } = await adminClient
      .from('organization_members')
      .select('role')
      .eq('org_id', org_id)
      .eq('user_id', callerId)
      .maybeSingle()

    if (membershipError) {
      return jsonResponse(
        { error: 'Error verificando membresia', details: membershipError.message },
        500,
      )
    }

    if (!callerMembership || (callerMembership.role !== 'owner' && callerMembership.role !== 'admin')) {
      return jsonResponse(
        { error: 'No autorizado: solo owners o admins pueden invitar usuarios' },
        403,
      )
    }

    // Invitar via email
    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: redirect_url,
        data: {
          first_name,
          last_name,
          role,
        },
      })

    if (inviteError || !inviteData?.user) {
      return jsonResponse(
        {
          error: 'No se pudo invitar al usuario',
          details: inviteError?.message ?? 'Unknown error',
        },
        400,
      )
    }

    const newUser = inviteData.user

    // Marcar rol en app_metadata (no manipulable desde el cliente)
    const { error: updateMetaError } = await adminClient.auth.admin.updateUserById(
      newUser.id,
      {
        app_metadata: {
          role,
          org_id,
        },
      },
    )

    if (updateMetaError) {
      await adminClient.auth.admin.deleteUser(newUser.id).catch(() => {})
      return jsonResponse(
        {
          error: 'No se pudo asignar rol',
          details: updateMetaError.message,
        },
        400,
      )
    }

    // Crear membresia en la org
    const { data: member, error: insertError } = await adminClient
      .from('organization_members')
      .insert({
        org_id,
        user_id: newUser.id,
        role,
      })
      .select('*')
      .single()

    if (insertError) {
      await adminClient.auth.admin.deleteUser(newUser.id).catch(() => {})
      return jsonResponse(
        {
          error: 'No se pudo crear la membresia',
          details: insertError.message,
        },
        400,
      )
    }

    return jsonResponse({ member, email }, 200)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonResponse({ error: 'Internal error', details: message }, 500)
  }
})
