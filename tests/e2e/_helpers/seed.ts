import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient } from './supabaseAdmin'

const SEED_TAG = 'e2e-cx-loop'

export interface SeedContext {
  client: SupabaseClient
  orgId: string
  planId: string
  routeId: string
  stopId: string
  planStopId: string
  trackingToken: string
  customerEmail: string
}

// Inserta una org con email habilitado + un plan publicado + una parada
// asignada a una ruta con un driver, lista para que el operador la marque
// como completed. Idempotente: limpia seeds previos con tag SEED_TAG.
export async function seedCxLoopOrg(): Promise<SeedContext> {
  const client = adminClient()
  await cleanupCxLoopSeed()

  const orgName = `${SEED_TAG}-${Date.now()}`
  const { data: org, error: orgErr } = await client
    .from('organizations')
    .insert({ name: orgName, slug: `${SEED_TAG}-${randomUUID().slice(0, 6)}` })
    .select()
    .single()
  if (orgErr || !org) throw new Error(`seed: org failed: ${orgErr?.message}`)
  const orgId = org.id as string

  // Notification settings: email habilitado.
  const resendKey = process.env.E2E_RESEND_TEST_KEY ?? null
  const { error: settingsErr } = await client.from('org_notification_settings').insert({
    org_id: orgId,
    email_enabled: true,
    notify_on_delivered: true,
    notify_on_failed: true,
    notify_on_transit: true,
    send_survey: true,
    survey_delay_min: 0, // disparar survey en el siguiente cron tick
    resend_api_key: resendKey,
    email_from_address: 'noreply@vuoo.cl',
    email_from_name: orgName,
  })
  if (settingsErr) throw new Error(`seed: notification_settings: ${settingsErr.message}`)

  // Driver.
  const { data: driver, error: driverErr } = await client
    .from('drivers')
    .insert({
      org_id: orgId,
      first_name: SEED_TAG,
      last_name: 'Driver',
      email: `${SEED_TAG}-driver-${randomUUID().slice(0, 6)}@example.com`,
    })
    .select()
    .single()
  if (driverErr || !driver) throw new Error(`seed: driver: ${driverErr?.message}`)

  // Stop.
  const customerEmail = `${SEED_TAG}-customer-${randomUUID().slice(0, 6)}@example.com`
  const { data: stop, error: stopErr } = await client
    .from('stops')
    .insert({
      org_id: orgId,
      name: 'Cliente E2E',
      address: 'Av. Demo 123, Santiago',
      lat: -33.45,
      lng: -70.66,
      customer_name: 'Cliente E2E',
      customer_email: customerEmail,
    })
    .select()
    .single()
  if (stopErr || !stop) throw new Error(`seed: stop: ${stopErr?.message}`)

  // Plan + Route + Plan Stop.
  const today = new Date().toISOString().slice(0, 10)
  const { data: plan, error: planErr } = await client
    .from('plans')
    .insert({ org_id: orgId, name: 'E2E plan', date: today, status: 'published' })
    .select()
    .single()
  if (planErr || !plan) throw new Error(`seed: plan: ${planErr?.message}`)

  const { data: route, error: routeErr } = await client
    .from('routes')
    .insert({
      org_id: orgId,
      plan_id: plan.id,
      driver_id: driver.id,
      name: 'R-1',
      status: 'in_transit',
    })
    .select()
    .single()
  if (routeErr || !route) throw new Error(`seed: route: ${routeErr?.message}`)

  const { data: planStop, error: psErr } = await client
    .from('plan_stops')
    .insert({
      org_id: orgId,
      plan_id: plan.id,
      route_id: route.id,
      stop_id: stop.id,
      status: 'pending',
      order_index: 0,
    })
    .select()
    .single()
  if (psErr || !planStop) throw new Error(`seed: plan_stop: ${psErr?.message}`)

  return {
    client,
    orgId,
    planId: plan.id,
    routeId: route.id,
    stopId: stop.id,
    planStopId: planStop.id,
    trackingToken: planStop.tracking_token,
    customerEmail,
  }
}

// Limpieza idempotente. Borra orgs con el tag SEED_TAG; CASCADE arrastra plans,
// routes, plan_stops, stops, drivers, settings, notification_logs, feedback.
export async function cleanupCxLoopSeed(): Promise<void> {
  const client = adminClient()
  await client.from('organizations').delete().like('name', `${SEED_TAG}-%`)
}

// Espera con backoff a que aparezca un row que matchee `match` en la tabla.
// Útil cuando el trigger SQL dispara la edge async y necesitamos esperar.
export async function waitForRow<T>(opts: {
  client: SupabaseClient
  table: string
  match: Record<string, unknown>
  timeoutMs?: number
  intervalMs?: number
}): Promise<T> {
  const { client, table, match, timeoutMs = 30_000, intervalMs = 1_000 } = opts
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const q = client.from(table).select('*')
    let query = q
    for (const [k, v] of Object.entries(match)) {
      query = query.eq(k, v as never)
    }
    const { data } = await query.limit(1).maybeSingle()
    if (data) return data as T
    await new Promise((r) => setTimeout(r, intervalMs))
  }

  throw new Error(
    `waitForRow timeout after ${timeoutMs}ms — table=${table} match=${JSON.stringify(match)}`,
  )
}
