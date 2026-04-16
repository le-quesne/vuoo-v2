// supabase/functions/invite-driver/index.ts
//
// Crea un conductor:
//   - Genera una contrasena temporal legible
//   - Crea el auth user ya confirmado (email_confirm:true) con esa contrasena
//   - Inserta el registro en drivers enlazado a ese user_id
//   - Envia un email al conductor con sus credenciales (usando Resend)
//
// Body esperado:
//   {
//     email: string,
//     first_name: string,
//     last_name: string,
//     org_id: string,
//     driver_data: Record<string, unknown>
//   }
//
// Requiere:
//   - SUPABASE_URL
//   - SUPABASE_ANON_KEY
//   - SUPABASE_SERVICE_ROLE_KEY
//   - (opcional fallback) RESEND_API_KEY, RESEND_FROM_ADDRESS

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

// Alfabeto sin caracteres ambiguos (0/O, 1/l/I)
const PW_ALPHABET =
  'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

function generateTempPassword(length = 10): string {
  const buf = new Uint8Array(length)
  crypto.getRandomValues(buf)
  let out = ''
  for (const byte of buf) out += PW_ALPHABET[byte % PW_ALPHABET.length]
  return out
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

    // Caller debe ser miembro de la org
    const { data: membership, error: membershipError } = await adminClient
      .from('organization_members')
      .select('org_id, role')
      .eq('org_id', org_id)
      .eq('user_id', callerId)
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

    // Generar contrasena temporal
    const tempPassword = generateTempPassword(10)

    // Crear auth user ya confirmado
    const { data: createData, error: createError } =
      await adminClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        app_metadata: {
          role: 'driver',
          org_id,
        },
        user_metadata: {
          first_name,
          last_name,
          role: 'driver',
        },
      })

    if (createError || !createData?.user) {
      return jsonResponse(
        {
          error: 'No se pudo crear el conductor',
          details: createError?.message ?? 'Unknown error',
        },
        400,
      )
    }

    const newUser = createData.user

    // Insertar en drivers
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
      await adminClient.auth.admin.deleteUser(newUser.id).catch(() => {})
      return jsonResponse(
        {
          error: 'No se pudo crear el conductor',
          details: insertError.message,
        },
        400,
      )
    }

    // Obtener org settings para email
    const { data: orgData } = await adminClient
      .from('organizations')
      .select('name')
      .eq('id', org_id)
      .single()
    const orgName = orgData?.name ?? 'Vuoo'

    const { data: orgSettings } = await adminClient
      .from('org_notification_settings')
      .select('resend_api_key, email_from_name, email_from_address, primary_color, logo_url')
      .eq('org_id', org_id)
      .maybeSingle()

    const resendKey = orgSettings?.resend_api_key ?? Deno.env.get('RESEND_API_KEY')
    const fromAddress =
      orgSettings?.email_from_address ??
      Deno.env.get('RESEND_FROM_ADDRESS') ??
      'noreply@vuoo.cl'
    const fromName = orgSettings?.email_from_name ?? orgName
    const primaryColor = orgSettings?.primary_color ?? '#6366f1'
    const logoHtml = orgSettings?.logo_url
      ? `<img src="${orgSettings.logo_url}" alt="${escapeHtml(orgName)}" style="max-height:48px;margin-bottom:16px;" />`
      : ''

    let emailSent = false
    let emailError: string | null = null

    if (resendKey) {
      const subject = `Tus credenciales para ${orgName}`
      const safeFirstName = escapeHtml(first_name)
      const safeOrgName = escapeHtml(orgName)
      const safeEmail = escapeHtml(email)
      const safePassword = escapeHtml(tempPassword)

      const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#f4f4f5;">
  <div style="max-width:480px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:${primaryColor};padding:24px;text-align:center;">
      ${logoHtml}
      <h2 style="color:#fff;margin:0;font-size:18px;">${safeOrgName}</h2>
    </div>
    <div style="padding:24px;color:#18181b;">
      <p>Hola ${safeFirstName},</p>
      <p>Fuiste agregado como conductor en <strong>${safeOrgName}</strong>. Inicia sesion en la app movil de Vuoo con estas credenciales:</p>
      <div style="background:#f4f4f5;border-radius:8px;padding:16px;margin:16px 0;font-family:monospace;font-size:14px;">
        <div><strong>Email:</strong> ${safeEmail}</div>
        <div style="margin-top:8px;"><strong>Contrasena temporal:</strong> ${safePassword}</div>
      </div>
      <p style="font-size:13px;color:#71717a;">Por seguridad, te recomendamos cambiar tu contrasena desde la app despues del primer ingreso.</p>
    </div>
  </div>
</body>
</html>`.trim()

      try {
        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${fromName} <${fromAddress}>`,
            to: email,
            subject,
            html: htmlContent,
          }),
        })

        if (resp.ok) {
          emailSent = true
        } else {
          const errBody = await resp.text().catch(() => '')
          emailError = `Resend ${resp.status}: ${errBody}`
        }
      } catch (err) {
        emailError = err instanceof Error ? err.message : 'Unknown email error'
      }
    } else {
      emailError = 'Resend API key not configured'
    }

    return jsonResponse(
      {
        driver,
        email_sent: emailSent,
        email_error: emailError,
        // Siempre devolvemos la temp_password para que el admin pueda
        // entregarla manualmente si el email fallo.
        temp_password: tempPassword,
      },
      200,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonResponse({ error: 'Internal error', details: message }, 500)
  }
})
