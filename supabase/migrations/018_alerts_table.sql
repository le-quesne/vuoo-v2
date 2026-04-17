-- =============================================
-- Alertas persistidas en DB (multi-dispatcher + historial)
-- =============================================
--
-- Hasta ahora las alertas de la Torre viven en `useState<LiveAlert[]>`
-- de ControlPage.tsx. Dos dispatchers viendo la misma org ven alertas
-- distintas, y cerrar la pestaña borra el historial completo.
--
-- Con la tabla `alerts`:
--   - Las event-driven (stop completada/fallida, ruta iniciada/completa,
--     incidente, feedback) se generan con triggers SQL. Todos los
--     dispatchers las reciben por realtime y pueden ack una vez.
--   - Las derivadas de tiempo (offline, atrasado, stationary, batería
--     baja) siguen calculándose client-side porque requieren re-
--     evaluación continua contra `now()`. Es un híbrido intencional.
--
-- Ack compartido: cualquier dispatcher puede marcar una alert como
-- atendida; el resto la ve ack'd en realtime.

create table alerts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  type            text not null,
  priority        text not null check (priority in ('high', 'medium', 'info')),
  title           text not null,
  body            text,

  -- Referencias opcionales para deep-linking desde la alert
  route_id        uuid references routes(id) on delete set null,
  plan_stop_id    uuid references plan_stops(id) on delete set null,
  driver_id       uuid references drivers(id) on delete set null,
  incident_id     uuid references operational_incidents(id) on delete set null,
  feedback_id     uuid references delivery_feedback(id) on delete set null,

  -- Ack compartido entre dispatchers
  acknowledged_by uuid references auth.users(id) on delete set null,
  acknowledged_at timestamptz,

  created_at      timestamptz not null default now()
);

create index idx_alerts_org_created
  on alerts(org_id, created_at desc);

create index idx_alerts_unacked
  on alerts(org_id, created_at desc)
  where acknowledged_at is null;

-- RLS
alter table alerts enable row level security;

create policy "Org members can view alerts"
  on alerts for select
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Org members can update alerts"
  on alerts for update
  using (public.is_super_admin() or org_id in (select public.user_org_ids()))
  with check (public.is_super_admin() or org_id in (select public.user_org_ids()));

-- Inserts: los triggers usan SECURITY DEFINER y bypassean RLS. Esta
-- policy sólo restringe inserts manuales desde clientes autenticados.
create policy "Org members can insert alerts"
  on alerts for insert
  with check (public.is_super_admin() or org_id in (select public.user_org_ids()));

alter publication supabase_realtime add table alerts;
alter table alerts replica identity full;

-- ---------------------------------------------
-- 1. Trigger: plan_stops UPDATE → stop_completed / stop_failed
-- ---------------------------------------------
create or replace function public.alerts_on_plan_stop_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stop_name  text;
  v_driver_id  uuid;
  v_driver_nm  text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status not in ('completed', 'incomplete', 'cancelled') then
    return new;
  end if;

  select s.name into v_stop_name from stops s where s.id = new.stop_id;

  select r.driver_id, coalesce(d.first_name || ' ' || d.last_name, 'Conductor')
    into v_driver_id, v_driver_nm
    from routes r
    left join drivers d on d.id = r.driver_id
    where r.id = new.route_id;

  insert into alerts (org_id, type, priority, title, plan_stop_id, route_id, driver_id)
  values (
    new.org_id,
    case when new.status = 'completed' then 'stop_completed' else 'stop_failed' end,
    case when new.status = 'completed' then 'info' else 'high' end,
    case
      when new.status = 'completed' then v_driver_nm || ' completó: ' || coalesce(v_stop_name, 'parada')
      else v_driver_nm || ' falló: ' || coalesce(v_stop_name, 'parada')
    end,
    new.id, new.route_id, v_driver_id
  );
  return new;
end;
$$;

create trigger trg_alerts_plan_stop
  after update of status on plan_stops
  for each row execute function public.alerts_on_plan_stop_change();

-- ---------------------------------------------
-- 2. Trigger: routes UPDATE → route_started / route_completed
-- ---------------------------------------------
create or replace function public.alerts_on_route_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_nm text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status not in ('in_transit', 'completed') then
    return new;
  end if;

  select coalesce(d.first_name || ' ' || d.last_name, 'Conductor')
    into v_driver_nm
    from drivers d where d.id = new.driver_id;

  insert into alerts (org_id, type, priority, title, route_id, driver_id)
  values (
    new.org_id,
    case when new.status = 'in_transit' then 'route_started' else 'route_completed' end,
    'info',
    case
      when new.status = 'in_transit' then coalesce(v_driver_nm, 'Conductor') || ' inició ruta'
      else coalesce(v_driver_nm, 'Conductor') || ' completó su ruta'
    end,
    new.id, new.driver_id
  );
  return new;
end;
$$;

create trigger trg_alerts_route
  after update of status on routes
  for each row execute function public.alerts_on_route_change();

-- ---------------------------------------------
-- 3. Trigger: operational_incidents INSERT → incident
-- ---------------------------------------------
create or replace function public.alerts_on_incident_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_nm text;
  v_type_lbl  text;
begin
  select coalesce(d.first_name || ' ' || d.last_name, 'Conductor')
    into v_driver_nm
    from drivers d where d.id = new.driver_id;

  v_type_lbl := case new.type
    when 'vehicle_breakdown' then 'Avería de vehículo'
    when 'accident'          then 'Accidente'
    when 'weather'           then 'Clima'
    when 'driver_offline'    then 'Conductor offline'
    when 'customer_issue'    then 'Problema con cliente'
    else 'Incidente'
  end;

  insert into alerts (org_id, type, priority, title, body, route_id, driver_id, incident_id)
  values (
    new.org_id,
    'incident',
    'high',
    v_type_lbl || ': ' || coalesce(v_driver_nm, 'Conductor'),
    new.description,
    new.route_id, new.driver_id, new.id
  );
  return new;
end;
$$;

create trigger trg_alerts_incident
  after insert on operational_incidents
  for each row execute function public.alerts_on_incident_insert();

-- ---------------------------------------------
-- 4. Trigger: delivery_feedback INSERT → feedback_positive / _negative
-- ---------------------------------------------
create or replace function public.alerts_on_feedback_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_nm text;
  v_stars     text;
begin
  select coalesce(d.first_name || ' ' || d.last_name, 'Conductor')
    into v_driver_nm
    from drivers d where d.id = new.driver_id;

  v_stars := repeat('★', new.rating) || repeat('☆', 5 - new.rating);

  insert into alerts (org_id, type, priority, title, body, driver_id, plan_stop_id, feedback_id)
  values (
    new.org_id,
    case when new.rating <= 2 then 'feedback_negative' else 'feedback_positive' end,
    case
      when new.rating <= 2 then 'high'
      when new.rating <= 3 then 'medium'
      else 'info'
    end,
    v_stars || ' ' || coalesce(v_driver_nm, 'Conductor'),
    new.comment,
    new.driver_id, new.plan_stop_id, new.id
  );
  return new;
end;
$$;

create trigger trg_alerts_feedback
  after insert on delivery_feedback
  for each row execute function public.alerts_on_feedback_insert();

comment on table alerts is
  'Alertas operacionales persistidas. Generadas por triggers en plan_stops/routes/operational_incidents/delivery_feedback. Las derivadas de tiempo se siguen calculando client-side.';
