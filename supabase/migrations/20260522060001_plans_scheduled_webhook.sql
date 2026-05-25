-- =============================================
-- PRD 13b — Loop Email Only (Fase 1)
-- Trigger SQL → send-notification al publicar un plan (status='published')
--
-- Dispara una sola llamada a send-notification con header
-- `X-Event-Mode: plan-published` + body { plan_id }. La edge se encarga
-- de iterar plan_stops y enviar email "scheduled" a cada cliente.
-- =============================================

create or replace function public.notify_on_plan_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url     text;
  v_token   text;
begin
  -- Solo cuando pasa de no-publicado a publicado
  if new.status = 'published' and (old.status is null or old.status <> 'published') then
    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'supabase_url' limit 1;
    select decrypted_secret into v_token
      from vault.decrypted_secrets where name = 'service_role_key' limit 1;

    if v_url is null or v_token is null or v_url = '' or v_token = '' then
      raise notice 'notify_on_plan_published: vault secrets faltantes, skip';
      return new;
    end if;

    perform net.http_post(
      url     := v_url || '/functions/v1/send-notification',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || v_token,
                   'X-Event-Mode',  'plan-published'
                 ),
      body    := jsonb_build_object('plan_id', new.id),
      timeout_milliseconds := 10000
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_plan_published on plans;

create trigger trg_notify_plan_published
  after update of status on plans
  for each row
  execute function public.notify_on_plan_published();
