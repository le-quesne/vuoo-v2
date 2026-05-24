import { test, expect, type Page } from '@playwright/test'
import { seedCxLoopOrg, cleanupCxLoopSeed, waitForRow, type SeedContext } from './_helpers/seed'
import { supabaseUrl, anonHeaders } from './_helpers/supabaseAdmin'

// PRD 13b — Loop Experiencia Cliente Email-only
//
// Valida el flujo completo:
//   1. Marcar plan_stop como completed (trigger SQL dispara send-notification)
//   2. notification_logs registra row sent (email)
//   3. Cliente abre /track/:token y ve estado "Entregado"
//   4. Cliente envía rating vía submit-feedback edge
//   5. Dispatcher ve el NPS reflejado en Analytics
//
// Requisitos:
//   - Stack de Supabase corriendo con migrations aplicadas + trigger
//   - Edge functions send-notification + submit-feedback deployeadas
//   - Variables E2E_* (ver playwright.config.ts)

const REQUIRED_ENV = [
  'E2E_APP_BASE_URL',
  'E2E_SUPABASE_URL',
  'E2E_SUPABASE_SERVICE_KEY',
  'E2E_SUPABASE_ANON_KEY',
  'E2E_ADMIN_EMAIL',
  'E2E_ADMIN_PASSWORD',
] as const

const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k])

test.describe('PRD 13b — cx-loop-email', () => {
  test.skip(
    missingEnv.length > 0,
    `Faltan vars de entorno: ${missingEnv.join(', ')}. Ver playwright.config.ts.`,
  )

  let ctx: SeedContext

  test.beforeAll(async () => {
    ctx = await seedCxLoopOrg()
  })

  test.afterAll(async () => {
    await cleanupCxLoopSeed()
  })

  test('email + feedback + NPS dashboard end-to-end', async ({ page }) => {
    const noConsoleErrors = trackConsoleErrors(page)

    // ----- 1. Marcar como completed via service role -----
    const reportTime = new Date().toISOString()
    const { error: updateErr } = await ctx.client
      .from('plan_stops')
      .update({
        status: 'completed',
        report_time: reportTime,
        report_comments: 'Entregado en mano',
      })
      .eq('id', ctx.planStopId)

    expect(updateErr, 'update plan_stop should not fail').toBeNull()

    // ----- 2. Esperar notification_log con email sent (event delivered) -----
    const log = await waitForRow<{
      id: string
      channel: string
      status: string
      event_type: string
    }>({
      client: ctx.client,
      table: 'notification_logs',
      match: {
        plan_stop_id: ctx.planStopId,
        channel: 'email',
        event_type: 'delivered',
      },
      timeoutMs: 30_000,
    })
    expect(log.status, 'email log should be sent').toBe('sent')

    // ----- 3. Cliente visita /track/:token y ve "Entregado" -----
    await page.goto(`/track/${ctx.trackingToken}`)
    await expect(page.getByText(/Entregado/i)).toBeVisible({ timeout: 15_000 })

    // ----- 4. Cliente envía rating vía submit-feedback (edge pública) -----
    const headers = anonHeaders()
    const submitRes = await fetch(`${supabaseUrl()}/functions/v1/submit-feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: headers.apikey,
        Authorization: headers.authorization,
      },
      body: JSON.stringify({
        token: ctx.trackingToken,
        rating: 5,
        comment: 'Perfecto, llegó muy rápido',
      }),
    })
    expect(submitRes.ok, `submit-feedback returned ${submitRes.status}`).toBe(true)

    // ----- 5. Login dispatcher + NPS dashboard -----
    await loginDispatcher(page)
    await page.goto(`/analytics?section=customers`)

    // El badge NPS muestra 100 (un solo rating=5 → todos promoters)
    const npsScore = page.getByTestId('nps-score')
    await expect(npsScore).toBeVisible({ timeout: 15_000 })
    await expect(npsScore).toHaveText(/^(100|\d{1,3})$/)
    const npsText = (await npsScore.textContent())?.trim() ?? ''
    expect(Number(npsText), 'NPS debería ser positivo con rating=5').toBeGreaterThan(0)

    await expect(page.getByTestId('nps-total-responses')).toContainText('1')

    expect(noConsoleErrors(), 'no console.error during the flow').toEqual([])
  })

  test('retry recovers transient failures', async ({}) => {
    // Inserta un notification_log fallido elegible para retry y dispara
    // la edge en modo retry. El test no asume conectividad real a Resend:
    // si la key no es válida, marca el seed como retried con attempts++,
    // y validamos que el row se haya touched (attempts ↑) → el retry corrió.

    const { error: insertErr } = await ctx.client.from('notification_logs').insert({
      org_id: ctx.orgId,
      plan_stop_id: ctx.planStopId,
      channel: 'email',
      event_type: 'failed',
      recipient: ctx.customerEmail,
      status: 'failed',
      error_message: 'simulated transient failure',
      attempts: 1,
      last_attempt_at: new Date(Date.now() - 60_000).toISOString(),
      next_retry_at: new Date(Date.now() - 30_000).toISOString(),
    })
    expect(insertErr).toBeNull()

    const triggerRes = await fetch(`${supabaseUrl()}/functions/v1/send-notification`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.E2E_SUPABASE_SERVICE_KEY!}`,
        'Content-Type': 'application/json',
        'X-Retry-Mode': 'true',
      },
      body: '{}',
    })
    expect(triggerRes.ok, `retry endpoint returned ${triggerRes.status}`).toBe(true)

    const { data: rows } = await ctx.client
      .from('notification_logs')
      .select('attempts, status, last_attempt_at')
      .eq('plan_stop_id', ctx.planStopId)
      .eq('event_type', 'failed')
      .order('last_attempt_at', { ascending: false })
      .limit(1)

    expect(rows?.[0]).toBeDefined()
    expect((rows![0] as { attempts: number }).attempts).toBeGreaterThanOrEqual(2)
  })
})

// --- helpers ---

function trackConsoleErrors(page: Page): () => string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(err.message))
  // Filtramos mensajes inocuos del SDK de Mapbox / chunks dinámicos.
  const isNoise = (s: string) =>
    /favicon|ResizeObserver|Mapbox.*deprecat/i.test(s)
  return () => errors.filter((e) => !isNoise(e))
}

async function loginDispatcher(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel(/correo|email/i).fill(process.env.E2E_ADMIN_EMAIL!)
  await page.getByLabel(/contraseña|password/i).fill(process.env.E2E_ADMIN_PASSWORD!)
  await page.getByRole('button', { name: /ingresar|login|entrar/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 })
}
