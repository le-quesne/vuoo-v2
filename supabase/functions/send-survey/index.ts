// supabase/functions/send-survey/index.ts
//
// Envía email de encuesta NPS al cliente final entre `survey_delay_min` y
// `survey_delay_min + cron_interval` minutos después de una entrega
// `completed`.
//
// Dos modos:
//
//   1. Batch (default): el cron pasa por aquí cada 5 minutos sin body.
//      Busca todos los plan_stops candidatos en TODAS las orgs.
//
//   2. Por plan_stop: body = { plan_stop_id: 'uuid' }. Envía un único
//      survey ignorando el delay (útil para reenvío manual desde la UI).
//
// Auth: requiere service role key.
//
// Requiere:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

interface CandidateRow {
  id: string
  org_id: string
  tracking_token: string
  report_time: string
  stop: { customer_name: string | null; customer_email: string | null } | null
}

function surveyEmailHtml(params: {
  orgName: string
  customerName: string
  primaryColor: string
  logoUrl: string | null
  trackingUrl: string
  trackingToken: string
}): { subject: string; html: string } {
  const { orgName, customerName, primaryColor, logoUrl, trackingUrl, trackingToken } = params

  const NAVY = '#0F1629'
  const SLATE_900 = '#0F172A'
  const SLATE_700 = '#334155'
  const SLATE_500 = '#64748B'
  const SLATE_400 = '#94A3B8'
  const SLATE_200 = '#E2E8F0'
  const SLATE_50 = '#F8FAFC'

  const logoBlock = logoUrl
    ? `<img src="${logoUrl}" alt="${orgName}" width="48" style="display:block;margin:0 auto 14px;height:auto;max-height:48px;border:0;" />`
    : ''

  const shortToken = trackingToken.slice(0, 8).toUpperCase()

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>¿Cómo fue tu entrega de ${orgName}?</title>
</head>
<body style="margin:0;padding:0;background:${SLATE_50};font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${SLATE_900};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${SLATE_50};opacity:0;">
  Cuéntanos cómo fue tu entrega de ${orgName}
</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${SLATE_50};">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">
        <tr>
          <td align="center" style="padding:0 0 20px;">
            <a href="https://vuoo.cl" target="_blank" style="text-decoration:none;color:${NAVY};font-family:'Sora','Inter',-apple-system,sans-serif;font-size:18px;font-weight:700;letter-spacing:-0.02em;">vuoo</a>
          </td>
        </tr>
      </table>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#FFFFFF;border-radius:16px;border:1px solid ${SLATE_200};overflow:hidden;">
        <tr>
          <td style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid ${SLATE_200};">
            ${logoBlock}
            <div style="font-family:'Sora','Inter',-apple-system,sans-serif;font-size:18px;font-weight:600;color:${SLATE_900};letter-spacing:-0.01em;line-height:1.2;">${orgName}</div>
            <div style="margin-top:6px;font-size:12px;color:${SLATE_500};letter-spacing:0.02em;">Pedido #${shortToken}</div>
          </td>
        </tr>

        <tr>
          <td style="padding:40px 40px 8px;text-align:center;">
            <div style="font-size:36px;line-height:1;margin:0 0 18px;letter-spacing:4px;">⭐⭐⭐⭐⭐</div>
            <span style="display:inline-block;background:#FFFBEB;color:#B45309;font-size:12px;font-weight:600;padding:5px 12px;border-radius:999px;letter-spacing:0.01em;">Tu opinión cuenta</span>
            <h1 style="margin:18px 0 0;font-family:'Sora','Inter',-apple-system,sans-serif;font-size:24px;font-weight:600;color:${SLATE_900};letter-spacing:-0.02em;line-height:1.25;">¿Cómo fue tu entrega?</h1>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 40px 0;text-align:center;">
            <p style="margin:0;font-size:15px;line-height:1.65;color:${SLATE_700};">Hola ${customerName},</p>
            <p style="margin:8px 0 0;font-size:15px;line-height:1.65;color:${SLATE_700};">
              Gracias por tu compra en <strong>${orgName}</strong>. Tu opinión nos ayuda a mejorar y te toma menos de 30 segundos.
            </p>
          </td>
        </tr>

        <tr>
          <td align="center" style="padding:32px 40px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-radius:10px;background:${primaryColor};">
                  <a href="${trackingUrl}#feedback" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;letter-spacing:-0.01em;">Calificar entrega →</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 40px 36px;text-align:center;">
            <p style="margin:0;font-size:12px;color:${SLATE_400};line-height:1.5;">¿No funciona el botón? Copia este link en tu navegador:</p>
            <p style="margin:6px 0 0;font-size:12px;color:${SLATE_500};word-break:break-all;line-height:1.5;">
              <a href="${trackingUrl}#feedback" target="_blank" style="color:${SLATE_500};text-decoration:underline;">${trackingUrl}#feedback</a>
            </p>
          </td>
        </tr>
      </table>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">
        <tr>
          <td style="padding:24px 16px 8px;text-align:center;">
            <p style="margin:0;font-size:12px;color:${SLATE_400};line-height:1.6;">
              Si no esperabas este correo, puedes ignorarlo.
            </p>
            <p style="margin:10px 0 0;font-size:11px;color:${SLATE_400};line-height:1.6;letter-spacing:0.01em;">
              Notificación enviada por
              <a href="https://vuoo.cl" target="_blank" style="color:${NAVY};text-decoration:none;font-weight:600;">vuoo</a>
              · plataforma de logística de última milla
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`

  return {
    subject: `¿Cómo fue tu entrega de ${orgName}?`,
    html,
  }
}

async function sendOneSurvey(
  adminClient: SupabaseClient,
  candidate: CandidateRow,
): Promise<{ ok: boolean; error?: string; skipped?: string }> {
  if (!candidate.stop?.customer_email) {
    return { ok: false, skipped: 'no email' }
  }

  // Re-check: no doble-survey si ya existe un notification_log o un feedback.
  const { data: existingSurvey } = await adminClient
    .from('notification_logs')
    .select('id')
    .eq('plan_stop_id', candidate.id)
    .eq('event_type', 'survey')
    .limit(1)
    .maybeSingle()

  if (existingSurvey) return { ok: false, skipped: 'already sent' }

  const { data: existingFeedback } = await adminClient
    .from('delivery_feedback')
    .select('id')
    .eq('plan_stop_id', candidate.id)
    .limit(1)
    .maybeSingle()

  if (existingFeedback) return { ok: false, skipped: 'already rated' }

  const { data: orgSettings } = await adminClient
    .from('org_notification_settings')
    .select('*')
    .eq('org_id', candidate.org_id)
    .maybeSingle()

  // Resolver credenciales según `email_provider`:
  //   - platform: RESEND_API_KEY de plataforma + notificaciones@vuoo.cl
  //   - custom:   credenciales propias de la org
  const provider = (orgSettings?.email_provider ?? 'platform') as 'platform' | 'custom'
  const resendKey = provider === 'platform'
    ? ((Deno.env.get('VUOO_RESEND_API_KEY') ?? Deno.env.get('RESEND_API_KEY')) ?? null)
    : (orgSettings?.resend_api_key ?? null)
  if (!orgSettings || !orgSettings.email_enabled || !orgSettings.send_survey || !resendKey) {
    return { ok: false, skipped: 'org config disables survey' }
  }

  const { data: orgData } = await adminClient
    .from('organizations')
    .select('name')
    .eq('id', candidate.org_id)
    .single()

  const orgName = orgData?.name ?? 'Vuoo'
  const customerName = candidate.stop.customer_name ?? 'Cliente'
  const trackingUrl = `https://app.vuoo.cl/track/${candidate.tracking_token}`

  const { subject, html } = surveyEmailHtml({
    orgName,
    customerName,
    primaryColor: orgSettings.primary_color ?? '#0F1629',
    logoUrl: orgSettings.logo_url ?? null,
    trackingUrl,
    trackingToken: candidate.tracking_token,
  })

  const fromName = orgSettings.email_from_name ?? orgName
  const fromAddress = provider === 'platform'
    ? 'notificaciones@vuoo.cl'
    : (orgSettings.email_from_address ?? 'notificaciones@vuoo.cl')

  let externalId: string | null = null
  let errorMessage: string | null = null
  let success = false

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromAddress}>`,
        to: candidate.stop.customer_email,
        subject,
        html,
      }),
    })

    const result = await res.json().catch(() => null)

    if (res.ok) {
      externalId = result?.id ?? null
      success = true
    } else {
      errorMessage = `Resend API error: ${res.status} - ${JSON.stringify(result)}`
    }
  } catch (err) {
    errorMessage = `Email send error: ${err instanceof Error ? err.message : 'Unknown'}`
  }

  const nowIso = new Date().toISOString()

  await adminClient.from('notification_logs').insert({
    org_id: candidate.org_id,
    plan_stop_id: candidate.id,
    channel: 'email',
    event_type: 'survey',
    recipient: candidate.stop.customer_email,
    status: success ? 'sent' : 'failed',
    error_message: errorMessage,
    external_id: externalId,
    sent_at: success ? nowIso : null,
    attempts: 1,
    last_attempt_at: nowIso,
    next_retry_at: null,
  })

  return success ? { ok: true } : { ok: false, error: errorMessage ?? 'Unknown' }
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

    // Auth: solo service role (este endpoint NO es público).
    // verify_jwt en la gateway ya valida la firma. Decodificamos el JWT
    // para chequear claim `role` en vez de comparar contra serviceRoleKey,
    // que puede no ser idéntica al JWT emitido en otro momento.
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401)
    }
    const bearer = authHeader.replace(/^Bearer\s+/i, '').trim()
    let isServiceRole = false
    try {
      const parts = bearer.split('.')
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
        if (payload?.role === 'service_role') isServiceRole = true
      }
    } catch { /* ignore parse errors */ }
    if (!isServiceRole) {
      return jsonResponse({ error: 'Invalid token (service role required)' }, 401)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // Parse body (puede venir vacío para batch mode)
    const rawText = await req.text()
    const body = rawText
      ? ((() => { try { return JSON.parse(rawText) } catch { return null } })() as
          | { plan_stop_id?: string }
          | null)
      : null

    // ---- Modo 1: un solo plan_stop_id ----
    if (body?.plan_stop_id) {
      const { data: planStop, error } = await adminClient
        .from('plan_stops')
        .select(`
          id,
          org_id,
          tracking_token,
          report_time,
          status,
          stop:stops(customer_name, customer_email)
        `)
        .eq('id', body.plan_stop_id)
        .single()

      if (error || !planStop) {
        return jsonResponse({ error: 'plan_stop not found' }, 404)
      }
      if (planStop.status !== 'completed') {
        return jsonResponse({ error: 'plan_stop is not completed' }, 400)
      }

      const result = await sendOneSurvey(adminClient, planStop as unknown as CandidateRow)
      return jsonResponse(result, result.ok ? 200 : 400)
    }

    // ---- Modo 2: batch via cron ----
    // Buscamos plan_stops completados con email y SIN feedback ni survey.
    // El filtro de delay se evalúa por-row contra el setting de la org.
    const { data: candidates, error } = await adminClient
      .from('plan_stops')
      .select(`
        id,
        org_id,
        tracking_token,
        report_time,
        status,
        stop:stops(customer_name, customer_email)
      `)
      .eq('status', 'completed')
      .not('report_time', 'is', null)
      .limit(500)

    if (error) {
      return jsonResponse({ error: 'Error fetching candidates', details: error.message }, 500)
    }

    if (!candidates || candidates.length === 0) {
      return jsonResponse({ sent: 0, skipped: 0 }, 200)
    }

    // Cache de settings por org para no re-leerlos N veces.
    const orgSettingsCache = new Map<string, { send_survey: boolean; survey_delay_min: number }>()
    async function getOrgDelay(orgId: string) {
      let s = orgSettingsCache.get(orgId)
      if (!s) {
        const { data } = await adminClient
          .from('org_notification_settings')
          .select('send_survey, survey_delay_min')
          .eq('org_id', orgId)
          .maybeSingle()
        s = data
          ? { send_survey: data.send_survey ?? false, survey_delay_min: data.survey_delay_min ?? 30 }
          : { send_survey: false, survey_delay_min: 30 }
        orgSettingsCache.set(orgId, s)
      }
      return s
    }

    let sent = 0
    let skipped = 0
    const errors: string[] = []
    const nowMs = Date.now()

    for (const c of candidates) {
      const orgCfg = await getOrgDelay(c.org_id)
      if (!orgCfg.send_survey) {
        skipped += 1
        continue
      }
      const reportMs = new Date(c.report_time as string).getTime()
      const ageMin = (nowMs - reportMs) / 60_000
      if (ageMin < orgCfg.survey_delay_min) {
        skipped += 1
        continue
      }

      const result = await sendOneSurvey(adminClient, c as unknown as CandidateRow)
      if (result.ok) sent += 1
      else {
        skipped += 1
        if (result.error) errors.push(result.error)
      }
    }

    return jsonResponse({ sent, skipped, errors }, 200)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonResponse({ error: 'Internal error', details: message }, 500)
  }
})
