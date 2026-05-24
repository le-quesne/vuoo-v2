-- =============================================
-- PRD 13b — Loop Email Only (Fase 1)
-- Cron jobs para retry de notificaciones + envío de encuestas.
--
-- Depende de los GUCs `app.supabase_url` y `app.service_role_key`
-- documentados en supabase/webhooks/README.md.
-- =============================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Helper: dispara una edge function vía pg_net.http_post.
create or replace function public.invoke_edge_function(
  p_function_name text,
  p_extra_headers jsonb default '{}'::jsonb,
  p_body          jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url     text;
  v_token   text;
  v_headers jsonb;
  v_req_id  bigint;
begin
  v_url   := current_setting('app.supabase_url', true);
  v_token := current_setting('app.service_role_key', true);

  if v_url is null or v_token is null or v_url = '' or v_token = '' then
    raise notice 'invoke_edge_function(%): GUCs missing', p_function_name;
    return null;
  end if;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_token
  ) || coalesce(p_extra_headers, '{}'::jsonb);

  select net.http_post(
    url     := v_url || '/functions/v1/' || p_function_name,
    headers := v_headers,
    body    := p_body,
    timeout_milliseconds := 15000
  ) into v_req_id;

  return v_req_id;
end;
$$;

-- ----------------------------------------------
-- Cron jobs: idempotente vía bloque do.
-- ----------------------------------------------

do $$
begin
  if exists (select 1 from cron.job where jobname = 'retry-failed-notifications') then
    perform cron.unschedule('retry-failed-notifications');
  end if;

  perform cron.schedule(
    'retry-failed-notifications',
    '* * * * *',
    $cron$ select public.invoke_edge_function(
             'send-notification',
             jsonb_build_object('X-Retry-Mode', 'true')
           ); $cron$
  );

  if exists (select 1 from cron.job where jobname = 'send-pending-surveys') then
    perform cron.unschedule('send-pending-surveys');
  end if;

  perform cron.schedule(
    'send-pending-surveys',
    '*/5 * * * *',
    $cron$ select public.invoke_edge_function('send-survey'); $cron$
  );
end
$$;
