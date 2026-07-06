// supabase/functions/admin-create-org/index.ts
//
// Super-admin: crea una organización desde el panel admin y opcionalmente le
// asigna un owner por email. Si el usuario ya existe se adjunta como owner; si
// no existe, se crea con una CONTRASEÑA TEMPORAL (email ya confirmado) y se le
// envían las credenciales vía Resend con link al app de producción.
//
// Body: { name, slug?, owner_email?, owner_first_name?, owner_last_name?, is_demo? }
// Env:  SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//       VUOO_RESEND_API_KEY (o RESEND_API_KEY), APP_URL (default app.vuoo.cl)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const FROM_NAME = 'Vuoo'
const FROM_ADDRESS = 'notificaciones@vuoo.cl'
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://app.vuoo.cl').replace(/\/+$/, '')

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Contraseña temporal legible (sin caracteres ambiguos), suficientemente fuerte.
function generateTempPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
  return `Vuoo-${body}`
}

function credentialsEmailHtml(params: {
  orgName: string
  email: string
  password: string
  loginUrl: string
}): string {
  const { orgName, email, password, loginUrl } = params
  return `<!doctype html>
<html lang="es">
<body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6e8eb;">
        <tr><td style="background:#0F1629;padding:24px 32px;">
          <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.5px;">VUOO</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 12px;font-size:20px;color:#0F1629;">Te damos la bienvenida a Vuoo</h1>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#475467;">
            Se creó tu cuenta como <strong>owner</strong> de la organización <strong>${orgName}</strong>
            en Vuoo, la plataforma de ruteo y logística de última milla.
          </p>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#475467;">
            Ingresá con estas credenciales:
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f7f8fa;border:1px solid #e6e8eb;border-radius:10px;margin:0 0 20px;">
            <tr><td style="padding:14px 16px;font-size:13px;color:#475467;">
              <div style="margin-bottom:8px;">Email: <strong style="color:#0F1629;">${email}</strong></div>
              <div>Contraseña temporal:
                <strong style="color:#0F1629;font-family:ui-monospace,Menlo,Consolas,monospace;">${password}</strong>
              </div>
            </td></tr>
          </table>
          <a href="${loginUrl}" style="display:inline-block;background:#e11d48;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">
            Ingresar a Vuoo
          </a>
          <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#98a2b3;">
            Por seguridad, cambiá tu contraseña después de tu primer ingreso.<br>
            Si el botón no funciona, entrá a <span style="color:#667085;">${loginUrl}</span>
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #f0f1f3;">
          <p style="margin:0;font-size:11px;color:#98a2b3;">Si no esperabas este correo, podés ignorarlo.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

async function sendResendEmail(params: {
  apiKey: string
  to: string
  subject: string
  html: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${params.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_ADDRESS}>`,
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
    })
    const result = await res.json().catch(() => null)
    if (res.ok) return { ok: true }
    return { ok: false, error: `Resend API error: ${res.status} - ${JSON.stringify(result)}` }
  } catch (err) {
    return { ok: false, error: `Email send error: ${err instanceof Error ? err.message : 'Unknown'}` }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Missing server configuration' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing Authorization header' }, 401)

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData?.user) {
      return jsonResponse({ error: 'Invalid token', details: userError?.message ?? 'no user' }, 401)
    }

    if (userData.user.app_metadata?.is_super_admin !== true) {
      return jsonResponse({ error: 'No autorizado: se requiere super admin' }, 403)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const body = await req.json().catch(() => null)
    if (!body) return jsonResponse({ error: 'Invalid JSON body' }, 400)

    const { name, slug, owner_email, owner_first_name, owner_last_name, is_demo = false } = body as {
      name?: string
      slug?: string
      owner_email?: string
      owner_first_name?: string
      owner_last_name?: string
      is_demo?: boolean
    }

    if (!name || name.trim().length === 0) {
      return jsonResponse({ error: 'El nombre de la organización es obligatorio' }, 400)
    }

    // 1) Crear la org vía RPC (slug único). El owner se maneja aparte.
    const { data: org, error: orgError } = await userClient
      .rpc('admin_create_organization', {
        p_name: name.trim(),
        p_slug: slug?.trim() || null,
        p_owner_email: null,
        p_is_demo: !!is_demo,
      })
      .single()

    if (orgError || !org) {
      return jsonResponse({ error: 'No se pudo crear la organización', details: orgError?.message }, 400)
    }
    const newOrg = org as { id: string; name: string; slug: string; is_demo: boolean }

    // 2) Owner opcional.
    const email = owner_email?.trim().toLowerCase()
    if (!email) return jsonResponse({ org: newOrg, owner: { status: 'none' } }, 200)

    const ownerFail = (msg: string) =>
      jsonResponse({ org: newOrg, owner: { status: 'error', email, error: msg } }, 200)

    const { data: existingId, error: lookupError } = await userClient.rpc('admin_lookup_user_id', {
      p_email: email,
    })
    if (lookupError) return ownerFail(lookupError.message)

    // Usuario existente → adjuntar como owner (sin tocar su contraseña).
    if (existingId) {
      const { error: memberError } = await adminClient
        .from('organization_members')
        .insert({ org_id: newOrg.id, user_id: existingId, role: 'owner' })
      if (memberError) return ownerFail(memberError.message)
      return jsonResponse({ org: newOrg, owner: { status: 'attached', email } }, 200)
    }

    // Usuario nuevo → crear con contraseña temporal (email ya confirmado).
    const resendKey = Deno.env.get('VUOO_RESEND_API_KEY') ?? Deno.env.get('RESEND_API_KEY')
    if (!resendKey) return ownerFail('Falta VUOO_RESEND_API_KEY en el servidor')

    const localPart = email.split('@')[0]
    const firstName = owner_first_name?.trim() || localPart
    const lastName = owner_last_name?.trim() || ''
    const tempPassword = generateTempPassword()

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
      app_metadata: { role: 'owner', org_id: newOrg.id },
    })

    if (createError || !created?.user) {
      return ownerFail(createError?.message ?? 'No se pudo crear el usuario')
    }

    const { error: memberError } = await adminClient
      .from('organization_members')
      .insert({ org_id: newOrg.id, user_id: created.user.id, role: 'owner' })
    if (memberError) {
      await adminClient.auth.admin.deleteUser(created.user.id).catch(() => {})
      return ownerFail(memberError.message)
    }

    const loginUrl = `${APP_URL}/login`
    const sent = await sendResendEmail({
      apiKey: resendKey,
      to: email,
      subject: `Tu cuenta owner de ${newOrg.name} en Vuoo`,
      html: credentialsEmailHtml({ orgName: newOrg.name, email, password: tempPassword, loginUrl }),
    })

    return jsonResponse(
      { org: newOrg, owner: { status: 'created', email, email_sent: sent.ok, error: sent.ok ? undefined : sent.error } },
      200,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonResponse({ error: 'Internal error', details: message }, 500)
  }
})
