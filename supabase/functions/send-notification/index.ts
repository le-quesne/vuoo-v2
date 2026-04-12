// supabase/functions/send-notification/index.ts
//
// Endpoint interno. Se dispara via DB webhook cuando cambia el status
// de un plan_stop. Envia notificaciones al cliente via WhatsApp y/o Email.
//
// Body esperado (webhook payload de Supabase):
//   {
//     type: 'UPDATE',
//     table: 'plan_stops',
//     schema: 'public',
//     record: { ... },
//     old_record: { ... }
//   }
//
// Auth: requiere service role key o JWT valido.
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

type EventType = 'in_transit' | 'delivered' | 'failed'

interface WebhookPayload {
  type: string
  table: string
  schema: string
  record: Record<string, unknown>
  old_record: Record<string, unknown>
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

    // 1. Verify auth (service role or valid JWT)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header' }, 401)
    }

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

    // 2. Parse webhook payload
    const payload = (await req.json().catch(() => null)) as WebhookPayload | null
    if (!payload) {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const { record, old_record } = payload
    if (!record || !old_record) {
      return jsonResponse({ error: 'Missing record or old_record in payload' }, 400)
    }

    // 3. Determine event type from status change
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
    // We detect this by checking if route_id exists and the route is now in_transit
    if (!eventType && record.route_id) {
      const adminCheck = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })

      const { data: routeData } = await adminCheck
        .from('routes')
        .select('status')
        .eq('id', record.route_id as string)
        .single()

      // If route is in transit and the old status was different (first stop getting updated),
      // or if order_index is 0 (first stop), we consider it an in_transit event
      if (routeData?.status === 'in_transit' && oldStatus !== newStatus) {
        // Only send in_transit notification once per plan_stop
        // (skip if already sent for this plan_stop)
        const adminClientTemp = createClient(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })

        const { data: existingNotif } = await adminClientTemp
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

    // No relevant event to notify about
    if (!eventType) {
      return jsonResponse({ sent: 0, errors: [], reason: 'No notifiable event' }, 200)
    }

    // 4. Admin client for all subsequent queries
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    // 5. Get plan_stop details with stop and route
    const planStopId = record.id as string
    const orgId = record.org_id as string
    const trackingToken = record.tracking_token as string

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
    const customerName = stop.customer_name as string | null

    // Skip if no contact info
    if (!customerPhone && !customerEmail) {
      return jsonResponse({ sent: 0, errors: [], reason: 'No customer contact info' }, 200)
    }

    // 6. Get org notification settings
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

    // 7. Check if this event type is enabled in org settings
    const eventToggleMap: Record<EventType, string> = {
      in_transit: 'notify_on_transit',
      delivered: 'notify_on_delivered',
      failed: 'notify_on_failed',
    }

    const toggleKey = eventToggleMap[eventType]
    if (!orgSettings[toggleKey]) {
      return jsonResponse({ sent: 0, errors: [], reason: `Event ${eventType} is disabled` }, 200)
    }

    // 8. Check per-stop notification preferences
    const notifPrefs = (planStop.notification_preferences ?? {}) as Record<string, boolean>

    // 9. Build tracking URL
    const trackingUrl = `https://app.vuoo.cl/track/${trackingToken}`

    // 10. Get org name for templates
    const { data: orgData } = await adminClient
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single()

    const orgName = orgData?.name ?? 'Vuoo'

    // 11. Send notifications
    let sent = 0
    const errors: string[] = []

    // --- WhatsApp ---
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
                      { type: 'text', text: customerName ?? 'Cliente' },
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

        if (waResponse.ok) {
          sent += 1

          // Log success
          await adminClient.from('notification_logs').insert({
            org_id: orgId,
            plan_stop_id: planStopId,
            channel: 'whatsapp',
            event_type: eventType,
            recipient: customerPhone,
            template_id: templateName,
            status: 'sent',
            external_id: waResult?.messages?.[0]?.id ?? null,
            sent_at: new Date().toISOString(),
          })
        } else {
          const errMsg = `WhatsApp API error: ${waResponse.status} - ${JSON.stringify(waResult)}`
          errors.push(errMsg)

          // Log failure
          await adminClient.from('notification_logs').insert({
            org_id: orgId,
            plan_stop_id: planStopId,
            channel: 'whatsapp',
            event_type: eventType,
            recipient: customerPhone,
            template_id: templateName,
            status: 'failed',
            error_message: errMsg,
            sent_at: new Date().toISOString(),
          })
        }
      } catch (waErr) {
        const errMsg = `WhatsApp send error: ${waErr instanceof Error ? waErr.message : 'Unknown'}`
        errors.push(errMsg)

        await adminClient.from('notification_logs').insert({
          org_id: orgId,
          plan_stop_id: planStopId,
          channel: 'whatsapp',
          event_type: eventType,
          recipient: customerPhone,
          status: 'failed',
          error_message: errMsg,
        }).catch(() => {})
      }
    }

    // --- Email (Resend) ---
    if (
      orgSettings.email_enabled &&
      notifPrefs.email !== false &&
      customerEmail &&
      orgSettings.resend_api_key
    ) {
      try {
        const subjectMap: Record<EventType, string> = {
          in_transit: `Tu pedido de ${orgName} esta en camino`,
          delivered: `Tu pedido de ${orgName} fue entregado`,
          failed: `Novedad con tu pedido de ${orgName}`,
        }

        const subject = subjectMap[eventType]
        const displayName = customerName ?? 'Cliente'
        const primaryColor = orgSettings.primary_color ?? '#6366f1'
        const logoHtml = orgSettings.logo_url
          ? `<img src="${orgSettings.logo_url}" alt="${orgName}" style="max-height:48px;margin-bottom:16px;" />`
          : ''

        const bodyMap: Record<EventType, string> = {
          in_transit: `<p>Hola ${displayName},</p><p>Tu pedido de <strong>${orgName}</strong> esta en camino. Puedes seguir tu entrega en tiempo real:</p>`,
          delivered: `<p>Hola ${displayName},</p><p>Tu pedido de <strong>${orgName}</strong> fue entregado exitosamente. Puedes ver los detalles de la entrega aqui:</p>`,
          failed: `<p>Hola ${displayName},</p><p>Hubo una novedad con tu pedido de <strong>${orgName}</strong>. Revisa los detalles:</p>`,
        }

        const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#f4f4f5;">
  <div style="max-width:480px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:${primaryColor};padding:24px;text-align:center;">
      ${logoHtml}
      <h2 style="color:#fff;margin:0;font-size:18px;">${orgName}</h2>
    </div>
    <div style="padding:24px;">
      ${bodyMap[eventType]}
      <div style="text-align:center;margin:24px 0;">
        <a href="${trackingUrl}" style="display:inline-block;background:${primaryColor};color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;">
          Ver mi entrega
        </a>
      </div>
      <p style="font-size:13px;color:#71717a;">Si no solicitaste este pedido, puedes ignorar este correo.</p>
    </div>
  </div>
</body>
</html>`.trim()

        const emailFromName = orgSettings.email_from_name ?? orgName
        const emailFromAddress = orgSettings.email_from_address ?? `noreply@vuoo.cl`

        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${orgSettings.resend_api_key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${emailFromName} <${emailFromAddress}>`,
            to: customerEmail,
            subject,
            html: htmlContent,
          }),
        })

        const emailResult = await emailResponse.json().catch(() => null)

        if (emailResponse.ok) {
          sent += 1

          await adminClient.from('notification_logs').insert({
            org_id: orgId,
            plan_stop_id: planStopId,
            channel: 'email',
            event_type: eventType,
            recipient: customerEmail,
            status: 'sent',
            external_id: emailResult?.id ?? null,
            sent_at: new Date().toISOString(),
          })
        } else {
          const errMsg = `Resend API error: ${emailResponse.status} - ${JSON.stringify(emailResult)}`
          errors.push(errMsg)

          await adminClient.from('notification_logs').insert({
            org_id: orgId,
            plan_stop_id: planStopId,
            channel: 'email',
            event_type: eventType,
            recipient: customerEmail,
            status: 'failed',
            error_message: errMsg,
            sent_at: new Date().toISOString(),
          })
        }
      } catch (emailErr) {
        const errMsg = `Email send error: ${emailErr instanceof Error ? emailErr.message : 'Unknown'}`
        errors.push(errMsg)

        await adminClient.from('notification_logs').insert({
          org_id: orgId,
          plan_stop_id: planStopId,
          channel: 'email',
          event_type: eventType,
          recipient: customerEmail,
          status: 'failed',
          error_message: errMsg,
        }).catch(() => {})
      }
    }

    return jsonResponse({ sent, errors }, 200)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonResponse({ error: 'Internal error', details: message }, 500)
  }
})
