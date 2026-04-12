// supabase/functions/send-push/index.ts
//
// Envia notificaciones push via Expo Push API a los device_tokens
// asociados a una lista de user_ids.
//
// Body esperado:
//   {
//     user_ids: string[],
//     title: string,
//     body: string,
//     data?: Record<string, unknown>
//   }
//
// Auth: requiere Authorization header con un JWT valido (puede ser
// service-role o un usuario autenticado).
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

interface ExpoMessage {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
  sound: 'default'
}

interface DeviceTokenRow {
  token: string
  user_id: string
  platform: string | null
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

    // 1. Verificar JWT del caller (service-role o usuario autenticado).
    //    Aceptamos service-role directo (header == "Bearer <SERVICE_ROLE>")
    //    o un JWT de usuario valido.
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim()
    const isServiceRole = bearer === serviceRoleKey

    if (!isServiceRole) {
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
    }

    // 2. Parsear body
    const body = await req.json().catch(() => null)
    if (!body) {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const {
      user_ids,
      title,
      body: messageBody,
      data,
    } = body as {
      user_ids?: string[]
      title?: string
      body?: string
      data?: Record<string, unknown>
    }

    if (
      !Array.isArray(user_ids) ||
      user_ids.length === 0 ||
      !title ||
      !messageBody
    ) {
      return jsonResponse(
        {
          error:
            'user_ids (array no vacio), title y body son requeridos',
        },
        400,
      )
    }

    // 3. Service role client para leer device_tokens sin RLS.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: tokens, error: tokensError } = await adminClient
      .from('device_tokens')
      .select('token, user_id, platform')
      .in('user_id', user_ids)

    if (tokensError) {
      return jsonResponse(
        {
          error: 'Error leyendo device_tokens',
          details: tokensError.message,
        },
        500,
      )
    }

    const rows = (tokens ?? []) as DeviceTokenRow[]
    if (rows.length === 0) {
      return jsonResponse({ sent: 0, errors: [] }, 200)
    }

    // 4. Construir mensajes para Expo Push API
    const messages: ExpoMessage[] = rows.map((row) => ({
      to: row.token,
      title,
      body: messageBody,
      data: data ?? {},
      sound: 'default',
    }))

    // 5. Enviar a Expo
    let sent = 0
    const errors: Array<Record<string, unknown>> = []

    try {
      const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      })

      const expoJson = (await expoRes.json().catch(() => null)) as
        | { data?: Array<{ status: string; message?: string; details?: unknown }> }
        | null

      if (!expoRes.ok || !expoJson) {
        errors.push({
          error: 'Expo push API error',
          status: expoRes.status,
          body: expoJson,
        })
      } else {
        const tickets = expoJson.data ?? []
        for (const ticket of tickets) {
          if (ticket.status === 'ok') {
            sent += 1
          } else {
            errors.push({
              status: ticket.status,
              message: ticket.message,
              details: ticket.details,
            })
          }
        }
      }
    } catch (fetchErr) {
      const message =
        fetchErr instanceof Error ? fetchErr.message : 'Unknown fetch error'
      errors.push({ error: 'Failed to call Expo Push API', details: message })
    }

    return jsonResponse({ sent, errors }, 200)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonResponse({ error: 'Internal error', details: message }, 500)
  }
})
