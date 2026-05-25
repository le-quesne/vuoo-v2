-- =============================================
-- PRD 13b — Loop Email Only (Fase 1)
-- Refactor: trigger + cron usan supabase_vault para los secrets en vez
-- de GUCs.
--
-- Razón: setear GUCs vía `alter database postgres set ...` requiere ser
-- super-admin, lo cual no es accesible en proyectos Supabase managed.
-- Vault está disponible y es la forma "blessed" de almacenar secrets
-- consultables desde funciones SQL.
--
-- Setup operativo (UNA vez por entorno):
--   select vault.create_secret(
--     'https://<project>.supabase.co', 'supabase_url'
--   );
--   select vault.create_secret(
--     '<service-role-jwt>', 'service_role_key'
--   );
--
-- Las funciones leen vault.decrypted_secrets por `name`. Sin secrets,
-- skipean silenciosamente (raise notice).
-- =============================================

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

  if new.status not in ('completed', 'incomplete', 'cancelled', 'in_progress', 'pending') then
    return new;
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'supabase_url' limit 1;
  select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'service_role_key' limit 1;

  if v_url is null or v_token is null or v_url = '' or v_token = '' then
    raise notice 'notify_on_plan_stop_change: vault secrets vacíos, skip';
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
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'supabase_url' limit 1;
  select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'service_role_key' limit 1;

  if v_url is null or v_token is null or v_url = '' or v_token = '' then
    raise notice 'invoke_edge_function(%): vault secrets missing', p_function_name;
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
