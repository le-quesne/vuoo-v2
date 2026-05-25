// supabase/functions/send-notification/index.ts
//
// Endpoint interno. Dos modos:
//
// 1. Webhook (default): se dispara via trigger SQL (pg_net.http_post) cuando
//    cambia el status de un plan_stop. Body = payload de webhook Supabase.
//
// 2. Retry (header `X-Retry-Mode: true`): busca notification_logs en
//    estado `failed` con `attempts<3 AND next_retry_at<=now()`, los
//    reintenta y actualiza attempts/next_retry_at según backoff.
//
// Auth: requiere service role key o JWT valido.
//
// Requiere:
//   - SUPABASE_URL
//   - SUPABASE_ANON_KEY
//   - SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-retry-mode, x-event-mode',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type EventType = 'scheduled' | 'in_transit' | 'arriving' | 'delivered' | 'failed'

interface WebhookPayload {
  type: string
  table: string
  schema: string
  record: Record<string, unknown>
  old_record: Record<string, unknown>
}

// --- Backoff (idéntico a src/application/utils/notificationRetry.ts) ---
const MAX_NOTIFICATION_ATTEMPTS = 3
const BACKOFF_MINUTES: Record<number, number> = { 1: 1, 2: 5 }

function computeNextRetryAt(attempts: number): string | null {
  if (attempts >= MAX_NOTIFICATION_ATTEMPTS) return null
  const minutes = BACKOFF_MINUTES[attempts]
  if (minutes === undefined) return null
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

// --- Templates ---
//
// Diseño Vuoo (paleta navy + slate, tipografía Inter/Sora, layout receipt-style
// tipo Stripe/Linear). El color brand de la org se usa solo en el CTA para
// que la marca del cliente se sienta presente sin colorear todo el correo.
//
// Implementación:
//   - <table> inline (Outlook/Apple Mail/Gmail dark mode compat).
//   - Header con el wordmark "vuoo" en navy-900 + tagline gris (anchor de marca).
//   - Sección org: logo opcional + nombre de la org en grande.
//   - Status row: emoji + pill semántico minimal (sin gradientes).
//   - Tracking number visible para inspirar confianza.
//   - CTA con primary_color de la org.
//   - Footer slate con disclaimer + link a vuoo.cl.
function emailTemplate(params: {
  orgName: string
  customerName: string
  primaryColor: string
  logoUrl: string | null
  trackingUrl: string
  trackingToken: string
  eventType: EventType
}): { subject: string; html: string } {
  const { orgName, customerName, primaryColor, logoUrl, trackingUrl, trackingToken, eventType } = params

  const subjectMap: Record<EventType, string> = {
    scheduled: `Tu pedido de ${orgName} fue programado`,
    in_transit: `Tu pedido de ${orgName} está en camino`,
    arriving: `Tu pedido de ${orgName} está por llegar`,
    delivered: `Tu pedido de ${orgName} fue entregado`,
    failed: `Novedad con tu pedido de ${orgName}`,
  }

  type StatusCfg = {
    emoji: string
    pill: string
    pillBg: string
    pillText: string
    headline: string
    body: string
    cta: string
  }
  const statusConfig: Record<EventType, StatusCfg> = {
    scheduled: {
      emoji: '🗓️',
      pill: 'Programado',
      pillBg: '#F1F5F9',
      pillText: '#334155',
      headline: 'Tu pedido fue programado',
      body: `<strong>${orgName}</strong> agendó tu entrega. Te avisaremos cuando el conductor salga a ruta para que puedas seguirla en tiempo real.`,
      cta: 'Ver detalle',
    },
    in_transit: {
      emoji: '🚚',
      pill: 'En camino',
      pillBg: '#EFF6FF',
      pillText: '#1D4ED8',
      headline: 'Tu pedido salió a entrega',
      body: `Acaba de salir desde <strong>${orgName}</strong>. Puedes seguir el recorrido del conductor en tiempo real desde el mapa.`,
      cta: 'Seguir mi pedido',
    },
    arriving: {
      emoji: '📍',
      pill: 'Está por llegar',
      pillBg: '#FEF3C7',
      pillText: '#92400E',
      headline: 'Tu pedido está por llegar',
      body: `El conductor de <strong>${orgName}</strong> ya está cerca. Te recomendamos estar atento al timbre — sigue su ubicación en tiempo real desde el mapa.`,
      cta: 'Ver ubicación',
    },
    delivered: {
      emoji: '📦',
      pill: 'Entregado',
      pillBg: '#ECFDF5',
      pillText: '#047857',
      headline: 'Pedido entregado',
      body: `Tu pedido de <strong>${orgName}</strong> ya fue entregado. Puedes revisar el comprobante con foto y firma en cualquier momento.`,
      cta: 'Ver comprobante',
    },
    failed: {
      emoji: '⚠️',
      pill: 'Novedad',
      pillBg: '#FFFBEB',
      pillText: '#B45309',
      headline: 'No pudimos completar la entrega',
      body: `Hubo una novedad con tu pedido de <strong>${orgName}</strong>. Revisa el detalle para coordinar una nueva entrega.`,
      cta: 'Ver detalle',
    },
  }
  const cfg = statusConfig[eventType]

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
<title>${subjectMap[eventType]}</title>
</head>
<body style="margin:0;padding:0;background:${SLATE_50};font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${SLATE_900};-webkit-font-smoothing:antialiased;">
<!-- Preheader (oculto) -->
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${SLATE_50};opacity:0;">
  ${cfg.headline} — ${orgName}
</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${SLATE_50};">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <!-- Wordmark Vuoo top -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">
        <tr>
          <td align="center" style="padding:0 0 20px;">
            <a href="https://vuoo.cl" target="_blank" style="text-decoration:none;color:${NAVY};font-family:'Sora','Inter',-apple-system,sans-serif;font-size:18px;font-weight:700;letter-spacing:-0.02em;">vuoo</a>
          </td>
        </tr>
      </table>

      <!-- Card principal -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#FFFFFF;border-radius:16px;border:1px solid ${SLATE_200};overflow:hidden;">
        <!-- Org header -->
        <tr>
          <td style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid ${SLATE_200};">
            ${logoBlock}
            <div style="font-family:'Sora','Inter',-apple-system,sans-serif;font-size:18px;font-weight:600;color:${SLATE_900};letter-spacing:-0.01em;line-height:1.2;">${orgName}</div>
            <div style="margin-top:6px;font-size:12px;color:${SLATE_500};letter-spacing:0.02em;">Pedido #${shortToken}</div>
          </td>
        </tr>

        <!-- Hero status -->
        <tr>
          <td style="padding:40px 40px 8px;text-align:center;">
            <div style="font-size:48px;line-height:1;margin:0 0 18px;">${cfg.emoji}</div>
            <span style="display:inline-block;background:${cfg.pillBg};color:${cfg.pillText};font-size:12px;font-weight:600;padding:5px 12px;border-radius:999px;letter-spacing:0.01em;">${cfg.pill}</span>
            <h1 style="margin:18px 0 0;font-family:'Sora','Inter',-apple-system,sans-serif;font-size:24px;font-weight:600;color:${SLATE_900};letter-spacing:-0.02em;line-height:1.25;">${cfg.headline}</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:20px 40px 0;text-align:center;">
            <p style="margin:0;font-size:15px;line-height:1.65;color:${SLATE_700};">Hola ${customerName},</p>
            <p style="margin:8px 0 0;font-size:15px;line-height:1.65;color:${SLATE_700};">${cfg.body}</p>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td align="center" style="padding:32px 40px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-radius:10px;background:${primaryColor};">
                  <a href="${trackingUrl}" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;letter-spacing:-0.01em;">${cfg.cta} →</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Fallback link -->
        <tr>
          <td style="padding:16px 40px 36px;text-align:center;">
            <p style="margin:0;font-size:12px;color:${SLATE_400};line-height:1.5;">¿No funciona el botón? Copia este link en tu navegador:</p>
            <p style="margin:6px 0 0;font-size:12px;color:${SLATE_500};word-break:break-all;line-height:1.5;">
              <a href="${trackingUrl}" target="_blank" style="color:${SLATE_500};text-decoration:underline;">${trackingUrl}</a>
            </p>
          </td>
        </tr>
      </table>

      <!-- Footer -->
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

  return { subject: subjectMap[eventType], html }
}

// --- Email send helper ---
//
// Devuelve { ok, externalId?, error? }. NO escribe en notification_logs;
// el caller decide cómo registrar (insert nuevo vs update de un retry).
async function sendResendEmail(params: {
  apiKey: string
  fromName: string
  fromAddress: string
  to: string
  subject: string
  html: string
}): Promise<{ ok: boolean; externalId?: string; error?: string }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${params.fromName} <${params.fromAddress}>`,
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
    })

    const result = await res.json().catch(() => null)

    if (res.ok) {
      return { ok: true, externalId: result?.id ?? undefined }
    }
    return { ok: false, error: `Resend API error: ${res.status} - ${JSON.stringify(result)}` }
  } catch (err) {
    return { ok: false, error: `Email send error: ${err instanceof Error ? err.message : 'Unknown'}` }
  }
}

// --- Dispatcher genérico de email por plan_stop ---
//
// Pipeline:
//   1. Idempotencia: si ya hay un log `sent` para (plan_stop, event_type), skip.
//   2. Lee plan_stop + stop + org_settings + organization.
//   3. Filtra por toggle de evento + email habilitado + per-stop prefs.
//   4. Resuelve key + remitente según email_provider.
//   5. Renderiza + envía + escribe en notification_logs.
async function dispatchEmailEvent(
  adminClient: SupabaseClient,
  planStopId: string,
  eventType: EventType,
): Promise<{ ok: boolean; reason?: string; error?: string }> {
  // 1. Idempotencia
  const { data: priorLog } = await adminClient
    .from('notification_logs')
    .select('id')
    .eq('plan_stop_id', planStopId)
    .eq('event_type', eventType)
    .eq('status', 'sent')
    .limit(1)
    .maybeSingle()
  if (priorLog) return { ok: false, reason: 'already_sent' }

  // 2. Plan stop + stop + tracking
  const { data: planStop, error: psErr } = await adminClient
    .from('plan_stops')
    .select(`
      id, org_id, tracking_token, notification_preferences,
      stop:stops(customer_name, customer_email)
    `)
    .eq('id', planStopId)
    .single()
  if (psErr || !planStop) return { ok: false, error: `plan_stop ${planStopId} not found` }

  const stop = (planStop.stop ?? {}) as Record<string, unknown>
  const customerEmail = stop.customer_email as string | null
  const customerName = (stop.customer_name as string | null) ?? 'Cliente'
  if (!customerEmail) return { ok: false, reason: 'no_email' }

  const notifPrefs = (planStop.notification_preferences ?? {}) as Record<string, boolean>
  if (notifPrefs.email === false) return { ok: false, reason: 'email_pref_off' }

  // 3. Org settings + toggle
  const { data: orgSettings } = await adminClient
    .from('org_notification_settings')
    .select('*')
    .eq('org_id', planStop.org_id)
    .maybeSingle()
  if (!orgSettings || !orgSettings.email_enabled) return { ok: false, reason: 'email_disabled' }

  const toggleKey: Record<EventType, string> = {
    scheduled: 'notify_on_scheduled',
    in_transit: 'notify_on_transit',
    arriving: 'notify_on_arriving',
    delivered: 'notify_on_delivered',
    failed: 'notify_on_failed',
  }
  if (!orgSettings[toggleKey[eventType]]) return { ok: false, reason: 'event_disabled' }

  // 4. Credenciales por provider
  const provider = (orgSettings.email_provider ?? 'platform') as 'platform' | 'custom'
  const resendKey = provider === 'platform'
    ? ((Deno.env.get('VUOO_RESEND_API_KEY') ?? Deno.env.get('RESEND_API_KEY')) ?? null)
    : (orgSettings.resend_api_key ?? null)
  if (!resendKey) return { ok: false, reason: 'no_api_key' }

  const fromAddress = provider === 'platform'
    ? 'notificaciones@vuoo.cl'
    : (orgSettings.email_from_address ?? 'notificaciones@vuoo.cl')

  // 5. Org name + template
  const { data: orgData } = await adminClient
    .from('organizations')
    .select('name')
    .eq('id', planStop.org_id)
    .single()
  const orgName = orgData?.name ?? 'Vuoo'

  const trackingUrl = `https://app.vuoo.cl/track/${planStop.tracking_token}`
  const { subject, html } = emailTemplate({
    orgName,
    customerName,
    primaryColor: orgSettings.primary_color ?? '#0F1629',
    logoUrl: orgSettings.logo_url ?? null,
    trackingUrl,
    trackingToken: planStop.tracking_token as string,
    eventType,
  })

  const send = await sendResendEmail({
    apiKey: resendKey,
    fromName: orgSettings.email_from_name ?? orgName,
    fromAddress,
    to: customerEmail,
    subject,
    html,
  })

  const nowIso = new Date().toISOString()
  if (send.ok) {
    await adminClient.from('notification_logs').insert({
      org_id: planStop.org_id,
      plan_stop_id: planStopId,
      channel: 'email',
      event_type: eventType,
      recipient: customerEmail,
      status: 'sent',
      external_id: send.externalId ?? null,
      sent_at: nowIso,
      attempts: 1,
      last_attempt_at: nowIso,
    })
    return { ok: true }
  }

  await adminClient.from('notification_logs').insert({
    org_id: planStop.org_id,
    plan_stop_id: planStopId,
    channel: 'email',
    event_type: eventType,
    recipient: customerEmail,
    status: 'failed',
    error_message: send.error ?? 'Unknown error',
    attempts: 1,
    last_attempt_at: nowIso,
    next_retry_at: computeNextRetryAt(1),
  })
  return { ok: false, error: send.error ?? 'Unknown error' }
}

// --- Plan-published broadcast ---
//
// Cuando un plan se publica, recorremos todos los plan_stops con
// customer_email y mandamos 'scheduled' a cada uno. La idempotencia
// del dispatcher evita doble-envío si se vuelve a publicar.
async function handlePlanPublished(adminClient: SupabaseClient, planId: string | undefined) {
  if (!planId) return jsonResponse({ error: 'plan_id required' }, 400)

  const { data: stops, error } = await adminClient
    .from('plan_stops')
    .select('id, stop:stops(customer_email)')
    .eq('plan_id', planId)

  if (error) return jsonResponse({ error: 'Error listing plan stops', details: error.message }, 500)
  if (!stops || stops.length === 0) return jsonResponse({ sent: 0, skipped: 0 }, 200)

  let sent = 0
  let skipped = 0
  const errors: string[] = []
  for (const s of stops) {
    const stopRel = (s as { stop: { customer_email: string | null } | null }).stop
    if (!stopRel?.customer_email) { skipped += 1; continue }
    const res = await dispatchEmailEvent(adminClient, s.id, 'scheduled')
    if (res.ok) sent += 1
    else {
      skipped += 1
      if (res.error) errors.push(res.error)
    }
  }
  return jsonResponse({ sent, skipped, errors }, 200)
}

// --- Arriving: notificar al stop a +threshold cuando se completa uno ---
//
// Llamado después de un evento `delivered` en el webhook. Mira el route_id
// del stop recién completado, encuentra el stop con order_index =
// currentIdx + threshold dentro de la misma ruta, y si tiene email + está
// pending, dispara 'arriving' para él.
async function dispatchArrivingForNeighbor(
  adminClient: SupabaseClient,
  completedPlanStopId: string,
): Promise<{ planStopId: string; result: { ok: boolean; reason?: string; error?: string } } | null> {
  // 1. Leer el stop recién completado
  const { data: completed } = await adminClient
    .from('plan_stops')
    .select('id, org_id, route_id, order_index')
    .eq('id', completedPlanStopId)
    .single()
  if (!completed || !completed.route_id || completed.order_index === null) return null

  // 2. Threshold de la org
  const { data: orgSettings } = await adminClient
    .from('org_notification_settings')
    .select('arriving_stops_threshold, notify_on_arriving')
    .eq('org_id', completed.org_id)
    .maybeSingle()
  if (!orgSettings || !orgSettings.notify_on_arriving) return null
  const threshold = (orgSettings.arriving_stops_threshold ?? 3) as number
  if (threshold <= 0) return null

  // 3. Buscar el stop a +threshold en la misma ruta
  const targetIndex = (completed.order_index as number) + threshold
  const { data: target } = await adminClient
    .from('plan_stops')
    .select('id, status')
    .eq('route_id', completed.route_id)
    .eq('order_index', targetIndex)
    .maybeSingle()
  if (!target || target.status !== 'pending') return null

  const result = await dispatchEmailEvent(adminClient, target.id, 'arriving')
  return { planStopId: target.id, result }
}

// --- Retry mode handler ---
//
// Busca rows fallidos elegibles, las reintenta (solo email por ahora; WA en fase 2),
// y actualiza el row in-place con attempts++ + nuevo next_retry_at.
async function handleRetryMode(adminClient: SupabaseClient) {
  const { data: candidates, error } = await adminClient
    .from('notification_logs')
    .select('*')
    .eq('status', 'failed')
    .lt('attempts', MAX_NOTIFICATION_ATTEMPTS)
    .lte('next_retry_at', new Date().toISOString())
    .order('next_retry_at', { ascending: true })
    .limit(20)

  if (error) {
    return jsonResponse({ error: 'Error fetching retry candidates', details: error.message }, 500)
  }

  if (!candidates || candidates.length === 0) {
    return jsonResponse({ retried: 0, recovered: 0 }, 200)
  }

  let recovered = 0
  const errors: string[] = []

  for (const log of candidates) {
    // Solo email en fase 1. Whatsapp retry → fase 2.
    if (log.channel !== 'email') continue

    // Reconstruir contexto del envío original.
    const { data: planStop } = await adminClient
      .from('plan_stops')
      .select(`
        id,
        tracking_token,
        org_id,
        stop:stops (customer_name, customer_email)
      `)
      .eq('id', log.plan_stop_id)
      .single()

    if (!planStop) {
      errors.push(`plan_stop ${log.plan_stop_id} not found`)
      continue
    }

    const { data: orgSettings } = await adminClient
      .from('org_notification_settings')
      .select('*')
      .eq('org_id', log.org_id)
      .maybeSingle()

    const provider = (orgSettings?.email_provider ?? 'platform') as 'platform' | 'custom'
    const resendKey = provider === 'platform'
      ? ((Deno.env.get('VUOO_RESEND_API_KEY') ?? Deno.env.get('RESEND_API_KEY')) ?? null)
      : (orgSettings?.resend_api_key ?? null)
    if (!orgSettings || !orgSettings.email_enabled || !resendKey) {
      // No reintentar si la config se deshabilitó: marca attempts=MAX para frenar el loop.
      await adminClient
        .from('notification_logs')
        .update({
          attempts: MAX_NOTIFICATION_ATTEMPTS,
          next_retry_at: null,
          last_attempt_at: new Date().toISOString(),
          error_message: 'Email channel disabled or missing API key',
        })
        .eq('id', log.id)
      continue
    }

    const { data: orgData } = await adminClient
      .from('organizations')
      .select('name')
      .eq('id', log.org_id)
      .single()

    const orgName = orgData?.name ?? 'Vuoo'
    const stop = (planStop.stop ?? {}) as Record<string, unknown>
    const customerName = (stop.customer_name as string | null) ?? 'Cliente'
    const trackingUrl = `https://app.vuoo.cl/track/${planStop.tracking_token}`

    const { subject, html } = emailTemplate({
      orgName,
      customerName,
      primaryColor: orgSettings.primary_color ?? '#0F1629',
      logoUrl: orgSettings.logo_url ?? null,
      trackingUrl,
      trackingToken: planStop.tracking_token as string,
      eventType: log.event_type as EventType,
    })

    // En modo platform forzamos el remitente Vuoo; en custom usamos el del cliente.
    const fromAddress = provider === 'platform'
      ? 'notificaciones@vuoo.cl'
      : (orgSettings.email_from_address ?? 'notificaciones@vuoo.cl')

    const send = await sendResendEmail({
      apiKey: resendKey,
      fromName: orgSettings.email_from_name ?? orgName,
      fromAddress,
      to: log.recipient,
      subject,
      html,
    })

    const nextAttempts = (log.attempts as number) + 1
    const nowIso = new Date().toISOString()

    if (send.ok) {
      recovered += 1
      await adminClient
        .from('notification_logs')
        .update({
          status: 'sent',
          external_id: send.externalId ?? null,
          sent_at: nowIso,
          attempts: nextAttempts,
          last_attempt_at: nowIso,
          next_retry_at: null,
          error_message: null,
        })
        .eq('id', log.id)
    } else {
      errors.push(send.error ?? 'Unknown retry error')
      await adminClient
        .from('notification_logs')
        .update({
          status: 'failed',
          attempts: nextAttempts,
          last_attempt_at: nowIso,
          next_retry_at: computeNextRetryAt(nextAttempts),
          error_message: send.error ?? 'Unknown retry error',
        })
        .eq('id', log.id)
    }
  }

  return jsonResponse({ retried: candidates.length, recovered, errors }, 200)
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

    // 1. Verify auth.
    //
    // verify_jwt=true en la gateway de Supabase ya valida la firma del JWT
    // antes de invocarnos. Acá sólo necesitamos asegurarnos de que el rol
    // sea `service_role` (trigger/cron) o un usuario humano válido.
    //
    // Comparar `bearer === serviceRoleKey` no es confiable: Supabase puede
    // tener distintas service-role keys vigentes en paralelo (la inyectada
    // como env var vs. la usada por el trigger). Mejor: decodificar el JWT
    // y leer el claim `role`.
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
    } catch {
      // continuar con verificación de usuario
    }

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

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // 2. Retry mode → bypass webhook flow
    const retryMode = req.headers.get('X-Retry-Mode')?.toLowerCase() === 'true'
    if (retryMode) {
      return await handleRetryMode(adminClient)
    }

    // 3. Plan-published broadcast mode (trigger SQL en plans.status)
    const eventMode = req.headers.get('X-Event-Mode')?.toLowerCase()
    if (eventMode === 'plan-published') {
      const body = await req.json().catch(() => null) as { plan_id?: string } | null
      return await handlePlanPublished(adminClient, body?.plan_id)
    }

    // 4. Parse webhook payload
    const payload = (await req.json().catch(() => null)) as WebhookPayload | null
    if (!payload) {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const { record, old_record } = payload
    if (!record || !old_record) {
      return jsonResponse({ error: 'Missing record or old_record in payload' }, 400)
    }

    // 4. Determine event type from status change
    const newStatus = record.status as string
    const oldStatus = old_record.status as string

    let eventType: EventType | null = null

    if (newStatus === 'completed' && oldStatus !== 'completed') {
      eventType = 'delivered'
    } else if (
      (newStatus === 'incomplete' || newStatus === 'cancelled') &&
      oldStatus !== 'incomplete' &&
      oldStatus !== 'cancelled'
    ) {
      eventType = 'failed'
    }

    // Check if a route just started (plan_stop's route transitioned to in_transit)
    if (!eventType && record.route_id) {
      const { data: routeData } = await adminClient
        .from('routes')
        .select('status')
        .eq('id', record.route_id as string)
        .single()

      if (routeData?.status === 'in_transit' && oldStatus !== newStatus) {
        const { data: existingNotif } = await adminClient
          .from('notification_logs')
          .select('id')
          .eq('plan_stop_id', record.id as string)
          .eq('event_type', 'in_transit')
          .limit(1)
          .maybeSingle()

        if (!existingNotif) {
          eventType = 'in_transit'
        }
      }
    }

    if (!eventType) {
      return jsonResponse({ sent: 0, errors: [], reason: 'No notifiable event' }, 200)
    }

    // 5. Idempotency: ¿ya enviamos este (plan_stop, event_type)?
    // El webhook puede dispararse múltiples veces en updates encadenados.
    const planStopId = record.id as string
    const orgId = record.org_id as string
    const trackingToken = record.tracking_token as string

    const { data: priorLog } = await adminClient
      .from('notification_logs')
      .select('id, status')
      .eq('plan_stop_id', planStopId)
      .eq('event_type', eventType)
      .eq('status', 'sent')
      .limit(1)
      .maybeSingle()

    if (priorLog) {
      return jsonResponse({ sent: 0, errors: [], reason: 'Already sent (idempotent skip)' }, 200)
    }

    // 6. Get plan_stop details
    const { data: planStop, error: planStopError } = await adminClient
      .from('plan_stops')
      .select(`
        id,
        notification_preferences,
        stop:stops (
          customer_name,
          customer_phone,
          customer_email
        )
      `)
      .eq('id', planStopId)
      .single()

    if (planStopError || !planStop) {
      return jsonResponse(
        { error: 'Error fetching plan_stop', details: planStopError?.message },
        500,
      )
    }

    const stop = planStop.stop as Record<string, unknown>
    const customerPhone = stop.customer_phone as string | null
    const customerEmail = stop.customer_email as string | null
    const customerName = (stop.customer_name as string | null) ?? 'Cliente'

    if (!customerPhone && !customerEmail) {
      return jsonResponse({ sent: 0, errors: [], reason: 'No customer contact info' }, 200)
    }

    // 7. Org notification settings
    const { data: orgSettings, error: orgSettingsError } = await adminClient
      .from('org_notification_settings')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle()

    if (orgSettingsError) {
      return jsonResponse(
        { error: 'Error fetching org settings', details: orgSettingsError.message },
        500,
      )
    }

    if (!orgSettings) {
      return jsonResponse({ sent: 0, errors: [], reason: 'No org notification settings' }, 200)
    }

    const eventToggleMap: Record<EventType, string> = {
      scheduled: 'notify_on_scheduled',
      in_transit: 'notify_on_transit',
      arriving: 'notify_on_arriving',
      delivered: 'notify_on_delivered',
      failed: 'notify_on_failed',
    }
    if (!orgSettings[eventToggleMap[eventType]]) {
      return jsonResponse({ sent: 0, errors: [], reason: `Event ${eventType} is disabled` }, 200)
    }

    const notifPrefs = (planStop.notification_preferences ?? {}) as Record<string, boolean>
    const trackingUrl = `https://app.vuoo.cl/track/${trackingToken}`

    const { data: orgData } = await adminClient
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single()

    const orgName = orgData?.name ?? 'Vuoo'

    let sent = 0
    const errors: string[] = []

    // --- WhatsApp (sin retry en fase 1) ---
    if (
      orgSettings.whatsapp_enabled &&
      notifPrefs.whatsapp !== false &&
      customerPhone &&
      orgSettings.whatsapp_phone_id &&
      orgSettings.whatsapp_token
    ) {
      try {
        const templateMap: Record<EventType, string> = {
          in_transit: 'delivery_in_transit',
          delivered: 'delivery_completed',
          failed: 'delivery_failed',
        }

        const templateName = templateMap[eventType]

        const waResponse = await fetch(
          `https://graph.facebook.com/v21.0/${orgSettings.whatsapp_phone_id}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${orgSettings.whatsapp_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: customerPhone,
              type: 'template',
              template: {
                name: templateName,
                language: { code: 'es' },
                components: [
                  {
                    type: 'body',
                    parameters: [
                      { type: 'text', text: customerName },
                      { type: 'text', text: orgName },
                      { type: 'text', text: trackingUrl },
                    ],
                  },
                ],
              },
            }),
          },
        )

        const waResult = await waResponse.json().catch(() => null)
        const nowIso = new Date().toISOString()

        if (waResponse.ok) {
          sent += 1
          await adminClient.from('notification_logs').insert({
            org_id: orgId,
            plan_stop_id: planStopId,
            channel: 'whatsapp',
            event_type: eventType,
            recipient: customerPhone,
            template_id: templateName,
            status: 'sent',
            external_id: waResult?.messages?.[0]?.id ?? null,
            sent_at: nowIso,
            attempts: 1,
            last_attempt_at: nowIso,
          })
        } else {
          const errMsg = `WhatsApp API error: ${waResponse.status} - ${JSON.stringify(waResult)}`
          errors.push(errMsg)
          await adminClient.from('notification_logs').insert({
            org_id: orgId,
            plan_stop_id: planStopId,
            channel: 'whatsapp',
            event_type: eventType,
            recipient: customerPhone,
            template_id: templateName,
            status: 'failed',
            error_message: errMsg,
            attempts: 1,
            last_attempt_at: nowIso,
            // WA retry queda fuera de fase 1.
            next_retry_at: null,
          })
        }
      } catch (waErr) {
        const errMsg = `WhatsApp send error: ${waErr instanceof Error ? waErr.message : 'Unknown'}`
        errors.push(errMsg)
        const nowIso = new Date().toISOString()
        await adminClient.from('notification_logs').insert({
          org_id: orgId,
          plan_stop_id: planStopId,
          channel: 'whatsapp',
          event_type: eventType,
          recipient: customerPhone,
          status: 'failed',
          error_message: errMsg,
          attempts: 1,
          last_attempt_at: nowIso,
          next_retry_at: null,
        }).catch(() => {})
      }
    }

    // --- Email (Resend) con retry-on-failure ---
    // Resolver credenciales según el modo (`email_provider`):
    //   - platform: RESEND_API_KEY de plataforma + remitente notificaciones@vuoo.cl
    //   - custom:   resend_api_key + email_from_address de la org
    const inboundProvider = (orgSettings.email_provider ?? 'platform') as 'platform' | 'custom'
    const inboundResendKey = inboundProvider === 'platform'
      ? ((Deno.env.get('VUOO_RESEND_API_KEY') ?? Deno.env.get('RESEND_API_KEY')) ?? null)
      : (orgSettings.resend_api_key ?? null)
    const inboundFromAddress = inboundProvider === 'platform'
      ? 'notificaciones@vuoo.cl'
      : (orgSettings.email_from_address ?? 'notificaciones@vuoo.cl')

    if (
      orgSettings.email_enabled &&
      notifPrefs.email !== false &&
      customerEmail &&
      inboundResendKey
    ) {
      const { subject, html } = emailTemplate({
        orgName,
        customerName,
        primaryColor: orgSettings.primary_color ?? '#0F1629',
        logoUrl: orgSettings.logo_url ?? null,
        trackingUrl,
        trackingToken,
        eventType,
      })

      const result = await sendResendEmail({
        apiKey: inboundResendKey,
        fromName: orgSettings.email_from_name ?? orgName,
        fromAddress: inboundFromAddress,
        to: customerEmail,
        subject,
        html,
      })

      const nowIso = new Date().toISOString()

      if (result.ok) {
        sent += 1
        await adminClient.from('notification_logs').insert({
          org_id: orgId,
          plan_stop_id: planStopId,
          channel: 'email',
          event_type: eventType,
          recipient: customerEmail,
          status: 'sent',
          external_id: result.externalId ?? null,
          sent_at: nowIso,
          attempts: 1,
          last_attempt_at: nowIso,
        })
      } else {
        errors.push(result.error ?? 'Unknown email error')
        await adminClient.from('notification_logs').insert({
          org_id: orgId,
          plan_stop_id: planStopId,
          channel: 'email',
          event_type: eventType,
          recipient: customerEmail,
          status: 'failed',
          error_message: result.error ?? 'Unknown email error',
          attempts: 1,
          last_attempt_at: nowIso,
          next_retry_at: computeNextRetryAt(1),
        })
      }
    }

    // 9. Después de un delivered, intentar arrivingNeighbor (stop a +threshold).
    // No bloqueamos la respuesta principal si falla — el cron de retry recoge
    // los fails y la idempotencia previene doble-envío.
    let arrivingInfo: { plan_stop_id: string; ok: boolean; reason?: string } | null = null
    if (eventType === 'delivered') {
      const arr = await dispatchArrivingForNeighbor(adminClient, planStopId).catch(() => null)
      if (arr) {
        arrivingInfo = { plan_stop_id: arr.planStopId, ok: arr.result.ok, reason: arr.result.reason }
      }
    }

    return jsonResponse({ sent, errors, arriving: arrivingInfo }, 200)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonResponse({ error: 'Internal error', details: message }, 500)
  }
})
