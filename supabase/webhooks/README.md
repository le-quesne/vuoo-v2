# Webhooks & async triggers — vuoo-v2

Este folder documenta los webhooks/triggers async que disparan edge functions
desde Postgres vía `pg_net`. Todos están versionados como migrations bajo
`supabase/migrations/` — este README es la única doc operativa.

## 1. Trigger `trg_notify_plan_stop_status_change`

**Tabla**: `plan_stops`
**Evento**: `AFTER UPDATE OF status`
**Función destino**: `send-notification` (edge)
**Migration**: `20260522020000_plan_stops_notification_webhook.sql`

Dispara la edge function `send-notification` cada vez que `plan_stops.status`
cambia. La function decide internamente si el evento es notificable (`in_transit`,
`delivered`, `failed`) y elige los canales según `org_notification_settings`.

### Requisitos en el proyecto Supabase

```sql
-- 1. pg_net y pg_cron habilitados (Database → Extensions).
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 2. Secrets en supabase_vault. UNA vez por entorno.
--    Si ya existen, hacer update con vault.update_secret(id, new_value).
select vault.create_secret(
  'https://<project-ref>.supabase.co', 'supabase_url'
);
select vault.create_secret(
  '<service-role-jwt>', 'service_role_key'
);

-- 3. Verificar que se vean desde una función security-definer:
select name, length(decrypted_secret) > 0 as ok
from vault.decrypted_secrets
where name in ('supabase_url', 'service_role_key');
```

> ⚠️ La service role key vive en `vault.decrypted_secrets[name='service_role_key']`.
> NO se commitea en git. Para rotar la key, usar `vault.update_secret`.

### Verificación

```sql
-- ¿Está el trigger instalado?
select tgname from pg_trigger where tgrelid = 'public.plan_stops'::regclass;

-- ¿Están los settings vivos?
select current_setting('app.supabase_url', true), current_setting('app.service_role_key', true);

-- Smoke test: forzar un status change y mirar net._http_response.
update plan_stops set status = status where id = '<some-uuid>';
select id, status_code, content_type, created from net._http_response order by created desc limit 5;
```

## 2. Cron `retry-failed-notifications`

**Schedule**: cada 1 min (`* * * * *`)
**Target**: `send-notification` (edge) con header `X-Retry-Mode: true`
**Migration**: `20260522030000_notification_crons.sql`

Invoca `send-notification` en modo retry. La function busca rows
`notification_logs` con `status='failed' AND attempts<3 AND next_retry_at<=now()`
y reintenta uno por uno. Backoff: 1m → 5m → 30m.

## 3. Cron `send-pending-surveys`

**Schedule**: cada 5 min (`*/5 * * * *`)
**Target**: `send-survey` (edge)
**Migration**: `20260522030000_notification_crons.sql`

Barre `plan_stops` con status `completed`, sin feedback previo, cuya
`report_time` esté a >= `org_notification_settings.survey_delay_min` minutos
del presente. Envía email con link a `/track/:token#feedback`.

## Troubleshooting

- **El trigger no dispara**: verificar vault con
  `select name from vault.decrypted_secrets where name in ('supabase_url','service_role_key')`.
  Si faltan, ejecutar los `vault.create_secret(...)` arriba.
- **`net._http_response` muestra 401**: la service role key venció o no
  coincide con el proyecto. Rotar con `vault.update_secret`.
- **El edge function recibe el webhook pero responde "no notifiable event"**:
  es esperado para transiciones no relevantes (ej. `pending → in_progress`
  sin route en `in_transit`).
- **El cron no aparece en `cron.job`**: verificar `pg_cron` con
  `select * from pg_extension where extname='pg_cron'`.
