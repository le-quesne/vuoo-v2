-- =============================================
-- PRD 13b — Loop Email Only (Fase 1)
-- Trigger SQL → send-notification al cambiar plan_stops.status
--
-- Reemplaza el trigger pre-existente `trg_plan_stop_notification` que
-- estaba roto: enviaba el POST sin header `Authorization`, por lo que
-- la edge function devolvía 401 y nunca se notificaba a nadie.
--
-- Esta versión:
--   - Resuelve la URL + service-role key desde GUC settings de la database
--     (ver supabase/webhooks/README.md para el setup de los settings).
--   - Filtra status transitions irrelevantes para evitar tormenta.
--   - Mantiene el nombre `trg_plan_stop_notification` para compat.
--
-- Requisitos:
--   - pg_net habilitado (`create extension if not exists pg_net`).
--   - GUC settings `app.supabase_url` y `app.service_role_key` definidos
--     vía `alter database postgres set ...`.
-- =============================================

create extension if not exists pg_net;

create or replace function public.notify_on_plan_stop_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url     text;
  v_token   text;
  v_payload jsonb;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- Filtramos transitions que nunca generan notificación al cliente.
  -- (in_transit lo decide la function leyendo route.status.)
  if new.status not in ('completed', 'incomplete', 'cancelled', 'in_progress', 'pending') then
    return new;
  end if;

  begin
    v_url   := current_setting('app.supabase_url', true);
    v_token := current_setting('app.service_role_key', true);
  exception when others then
    raise notice 'notify_on_plan_stop_change: GUCs missing';
    return new;
  end;

  if v_url is null or v_token is null or v_url = '' or v_token = '' then
    raise notice 'notify_on_plan_stop_change: GUCs vacíos, skip';
    return new;
  end if;

  v_payload := jsonb_build_object(
    'type', 'UPDATE',
    'table', 'plan_stops',
    'schema', 'public',
    'record', to_jsonb(new),
    'old_record', to_jsonb(old)
  );

  perform net.http_post(
    url     := v_url || '/functions/v1/send-notification',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_token
               ),
    body    := v_payload,
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

-- Re-create trigger (idempotente).
drop trigger if exists trg_plan_stop_notification on plan_stops;

create trigger trg_plan_stop_notification
  after update of status on plan_stops
  for each row
  execute function public.notify_on_plan_stop_change();
