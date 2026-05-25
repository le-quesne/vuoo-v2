# PRD 13b — Loop Experiencia Cliente (Email-only, Fase 1)

**Pri**: P0
**Deriva de**: [[PRD 13]] — Loop Experiencia Cliente E2E
**Estado**: ~70% de la infra ya existe. Falta cablear el disparador, retry, survey y dashboard.

---

## Contexto

PRD 13 plantea el loop completo con WhatsApp + Email + SMS + surveys + NPS.
Aprobar templates Meta y verificar Business Account agrega 1–2 semanas de
calendario antes de poder probar end-to-end. **Fase 1 arranca solo con
email** (Resend) para cerrar el loop ya, validarlo con un cliente piloto, y
recién después sumar WhatsApp en una fase 2.

La decisión es pragmática: el costo marginal de habilitar email es bajo
(infra ya construida), no depende de aprobaciones externas, y permite
medir la captura de feedback contra el benchmark del PRD original (>15%).

---

## Estado actual (lo que YA existe)

### ✅ Implementado
- **Schema DB** (`supabase/migrations/005_customer_experience.sql`):
  `notification_logs`, `delivery_feedback`, `org_notification_settings`,
  `plan_stops.tracking_token`, `plan_stops.notification_preferences`.
- **Edge `get-tracking-status`** (378 LOC): mapa, ETA via Mapbox Directions,
  POD con signed URLs, branding, timeline de notificaciones.
- **Edge `send-notification`** (463 LOC): soporta WhatsApp y Email (Resend)
  con HTML inline branded. Eventos `in_transit`, `delivered`, `failed`.
- **Edge `submit-feedback`** (150 LOC): valida token, 1 feedback por
  entrega, persiste rating + comment.
- **Page pública `/track/:token`** (`TrackingPage.tsx`, 895 LOC): ya en el
  router (`router.tsx:43`).
- **Settings UI** (`NotificationSettingsPage.tsx`, 509 LOC): canales,
  credenciales, eventos, branding, survey.

### ⚠️ Gaps que cierra este PRD
1. **Sin disparador**: `send-notification` existe pero nadie la invoca al
   cambiar `plan_stops.status`. Sin esto, no se envía nada.
2. **Sin retry**: la function loggea `failed` pero no reintenta.
3. **Sin survey automático**: existe la captura (`submit-feedback`) y el
   setting `survey_delay_min`, pero no hay cron que dispare el email.
4. **Sin NPS dashboard**: `delivery_feedback` se llena pero no se visualiza.
5. **Sin verificación E2E**: no hay test Playwright que valide el flujo.

---

## Objetivos

1. Email se envía automáticamente a `plan_stops.customer_email` en cada
   transición de estado relevante (`in_transit`, `delivered`, `failed`).
2. Envíos fallidos se reintentan con backoff exponencial.
3. Cliente recibe email de encuesta 30 min post-entrega; rating + comentario
   se persisten.
4. Dispatcher ve NPS agregado por chofer/período en `AnalyticsPage`.
5. Todo el loop validado end-to-end por Playwright.

---

## Scope IN

### A. Database Webhook → `send-notification`
- Crear **Database Webhook** en Supabase (Dashboard → Database → Webhooks)
  o trigger SQL con `pg_net.http_post`:
  - Tabla: `plan_stops`
  - Evento: `UPDATE`
  - Condición: `OLD.status IS DISTINCT FROM NEW.status`
  - Target: `supabase/functions/send-notification`
  - Auth: service role key en header.
- Persistir la configuración como migration (`NNN_plan_stops_webhook.sql`)
  para que sea reproducible entre entornos.

### B. Retry con backoff
- Migration: agregar columnas a `notification_logs`:
  ```sql
  alter table notification_logs add column attempts int not null default 0;
  alter table notification_logs add column next_retry_at timestamptz;
  ```
- Modificar `send-notification`: al fallar, calcular `next_retry_at` según
  `attempts` (0→+1m, 1→+5m, 2→+30m). Después de 3 intentos, status
  permanece `failed` definitivo.
- pg_cron job cada minuto: `select retry_failed_notifications()` que
  invoca la edge function para rows con `status='failed' and attempts<3
  and next_retry_at<=now()`.

### C. Edge function `send-survey` + cron
- `supabase/functions/send-survey/index.ts`:
  - Acepta `plan_stop_id` o body de batch.
  - Lee `org_notification_settings.send_survey` y `survey_delay_min`.
  - Verifica que `plan_stop.status='completed'`,
    `delivery_feedback` aún vacío para ese stop, y
    `now() - report_time >= survey_delay_min`.
  - Envía email con CTA al link `https://app.vuoo.cl/track/:token#feedback`
    (la sección de rating ya existe en `TrackingPage`, validar id ancla).
  - Loggea en `notification_logs` con `event_type='survey'`.
- pg_cron cada 5 minutos: barre candidatos y dispara batch.

### D. NPS Dashboard
- Nuevo componente
  `src/presentation/features/analytics/components/NPSDashboard.tsx`:
  - Score promedio (rating mean × 20 → 0–100, o 1–5 directo, decidir).
  - Distribución de ratings (1–5).
  - Ranking por chofer (top/bottom 5).
  - Trend semanal.
  - Lista de comentarios negativos (rating ≤ 2) con link al stop.
- Service en `src/data/services/feedback/feedback.services.ts`:
  - `listForOrg(orgId, dateRange)` → `ServiceResult<DeliveryFeedback[]>`.
  - `summaryForOrg(orgId, dateRange)` → agregados.
- Integrar en `AnalyticsPage` como sub-tab o card.

### E. Test E2E Playwright
- `tests/e2e/cx-loop-email.spec.ts`:
  1. Seed: org con `email_enabled=true` + Resend test API key,
     plan publicado con un `plan_stop` (`customer_email` válido).
  2. Marcar `plan_stop.status='completed'` via service role.
  3. Poll `notification_logs` hasta encontrar row
     `channel='email' event_type='delivered' status='sent'` (timeout 30s).
  4. Visitar `/track/:token` → assert estado "Entregado" + POD visible.
  5. POST a `submit-feedback` con `token, rating=5, comment='ok'`.
  6. Login como dispatcher, visitar `AnalyticsPage` →
     assert que `data-testid="nps-score"` refleja el feedback.
- Idempotente: cleanup de seed al final.

---

## Scope OUT (movido a fase 2)

- WhatsApp Cloud API + aprobación Meta templates → PRD 13 (original).
- SMS Twilio → fase 3, no antes de validar email + WhatsApp.
- Eventos `delivery_scheduled` (publicar plan) y `delivery_arriving`
  (geofence ETA <15min) → fase 2.
- Push web nativo → fuera.
- Multi-idioma más allá de español → fuera.

---

## Esquema técnico

### Migrations nuevas
```sql
-- NNN_notification_retry.sql
alter table notification_logs add column attempts int not null default 0;
alter table notification_logs add column next_retry_at timestamptz;
create index idx_notification_logs_retry
  on notification_logs(status, next_retry_at)
  where status = 'failed' and attempts < 3;

-- NNN_plan_stops_webhook.sql
-- Database Webhook configurada via dashboard; documentar el setup
-- y el secret en supabase/webhooks/README.md.

-- NNN_send_survey_cron.sql
select cron.schedule(
  'send-pending-surveys',
  '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://<project>.supabase.co/functions/v1/send-survey',
       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
     ) $$
);

select cron.schedule(
  'retry-failed-notifications',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://<project>.supabase.co/functions/v1/send-notification',
       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'), 'X-Retry-Mode', 'true')
     ) $$
);
```

### Edge functions
- `supabase/functions/send-notification/index.ts` — extender con modo retry
  (header `X-Retry-Mode: true` → busca candidatos y reintenta).
- `supabase/functions/send-survey/index.ts` — nueva.

### Frontend
- `src/presentation/features/analytics/components/NPSDashboard.tsx`
- `src/data/services/feedback/{feedback.services.ts, feedback.types.ts, index.ts}`
- `src/domain/entities/feedback.ts` + `src/domain/adapters/feedback.adapter.ts`

### Tests
- `tests/e2e/cx-loop-email.spec.ts`
- `tests/unit/feedback.adapter.test.ts`
- `tests/unit/notification-retry-backoff.test.ts`

---

## Criterios de éxito

- Webhook dispara `send-notification` en <2s p95 desde el UPDATE.
- 100% de transiciones `pending→completed` con `customer_email` no nulo
  generan un row `sent` en `notification_logs` (validado con E2E).
- Retry recupera >80% de los `failed` transitorios (validado simulando
  fallo de Resend en test).
- Survey llega al cliente entre `survey_delay_min` y
  `survey_delay_min + 5min` post-entrega.
- NPS dashboard carga en <2s con 10k feedback rows.
- Test E2E `cx-loop-email.spec.ts` pasa green dos corridas seguidas.
- `pnpm typecheck` y `pnpm test` pasan.
- 0 `console.error` en el browser durante el flujo E2E.

---

## Dependencias

- **Resend**: cuenta + dominio verificado + API key cargada en
  `org_notification_settings.resend_api_key`.
- **pg_cron** habilitado en Supabase (extensión).
- **pg_net** habilitado para HTTP outbound desde Postgres.
- **Mapbox token público** ya configurado (lo usa `get-tracking-status`).
- NO depende de Meta Business Account ni aprobación de templates.

---

## Riesgos

- Database Webhook puede generar tormenta de invocaciones si un job
  actualiza N rows en batch → idempotency-key por `(plan_stop_id,
  event_type)` ya está parcialmente implementada en
  `send-notification`; validar coverage.
- Resend rate limits (default 10 req/s) → si volumen crece, usar batch API
  o queue. No urgente para piloto.
- pg_cron + pg_net pueden no estar habilitados en el proyecto actual —
  validar con `select * from pg_extension` antes de migrar.
- Email landing en spam: dominio sin SPF/DKIM va a inbox secundario.
  Verificar dominio en Resend antes del go-live.

---

## Plan de ejecución sugerido (orden)

1. Migration retry columns + webhook setup (sin retry aún).
2. Verificar end-to-end manual: publicar plan demo, marcar completed,
   confirmar email recibido.
3. Implementar retry logic + cron.
4. Implementar `send-survey` + cron.
5. NPS dashboard.
6. Test E2E Playwright.
7. Validar criterios de éxito en green.

Cada paso = 1 commit chico en `feat/prd-13b-email-loop`. PR a `main`
recién con todo verde.

---

## Cuándo promover a PRD 13 completo

Cuando este PRD esté shippeado y con 1 cliente piloto usando email por
2+ semanas con captura de feedback >10%, abrir trámite Meta Business
Account y ejecutar las secciones de WhatsApp del PRD 13 original.
