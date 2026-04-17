-- =============================================
-- Log histórico de eventos de rutas y paradas (P3)
-- =============================================
--
-- Ultimo paso del roadmap de realtime: tablas append-only que capturan
-- el ciclo de vida completo de cada ruta/parada. A diferencia de
-- `alerts` (UI-driven, se acks, se puede perder valor histórico),
-- estas dos tablas son la fuente auditable para:
--   - Timeline "Actividad reciente" en PlanDetailPage y la Torre.
--   - Analytics históricos: tiempo promedio entre llegada y completar,
--     tiempo entre status transitions por conductor, etc.
--   - Debugging ex-post: qué pasó entre las 14:32 y las 14:45.
--
-- Se alimentan con triggers SQL (SECURITY DEFINER) idempotentes:
--   - routes.status transitions → route_events.
--   - plan_stops.status transitions → stop_events.
-- Igual que `alerts`, habilitamos realtime para que el timeline se
-- actualice sin refresh.
--
-- No se hace ack ni update — son append-only. Se retienen hasta que
-- se quiera implementar una política de cleanup (ej. >90 días).

-- ---------------------------------------------
-- 1. Tabla route_events
-- ---------------------------------------------
create table route_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  route_id    uuid not null references routes(id) on delete cascade,
  driver_id   uuid references drivers(id) on delete set null,
  type        text not null check (type in (
    'created', 'assigned', 'started', 'completed', 'reopened', 'cancelled'
  )),
  meta        jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index idx_route_events_route on route_events(route_id, created_at desc);
create index idx_route_events_org   on route_events(org_id, created_at desc);

alter table route_events enable row level security;

create policy "Org members view route events"
  on route_events for select
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

-- ---------------------------------------------
-- 2. Tabla stop_events
-- ---------------------------------------------
create table stop_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  plan_stop_id  uuid not null references plan_stops(id) on delete cascade,
  route_id      uuid references routes(id) on delete set null,
  driver_id     uuid references drivers(id) on delete set null,
  type          text not null check (type in (
    'created', 'assigned', 'reassigned', 'completed', 'failed', 'cancelled', 'reopened'
  )),
  meta          jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index idx_stop_events_plan_stop on stop_events(plan_stop_id, created_at desc);
create index idx_stop_events_route     on stop_events(route_id, created_at desc);
create index idx_stop_events_org       on stop_events(org_id, created_at desc);

alter table stop_events enable row level security;

create policy "Org members view stop events"
  on stop_events for select
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

-- Realtime
alter publication supabase_realtime add table route_events;
alter publication supabase_realtime add table stop_events;

-- ---------------------------------------------
-- 3. Trigger: routes → route_events
-- ---------------------------------------------
create or replace function public.log_route_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_type text;
begin
  if tg_op = 'INSERT' then
    insert into route_events (org_id, route_id, driver_id, type, meta)
    values (new.org_id, new.id, new.driver_id, 'created',
            jsonb_build_object('status', new.status));
    return new;
  end if;

  -- Status transitions
  if new.status is distinct from old.status then
    v_type := case new.status
      when 'in_transit' then case when old.status = 'completed' then 'reopened' else 'started' end
      when 'completed'  then 'completed'
      else null
    end;
    if v_type is not null then
      insert into route_events (org_id, route_id, driver_id, type, meta)
      values (new.org_id, new.id, new.driver_id, v_type,
              jsonb_build_object('from', old.status, 'to', new.status));
    end if;
  end if;

  -- Driver reassignment
  if new.driver_id is distinct from old.driver_id then
    insert into route_events (org_id, route_id, driver_id, type, meta)
    values (new.org_id, new.id, new.driver_id, 'assigned',
            jsonb_build_object('from_driver', old.driver_id, 'to_driver', new.driver_id));
  end if;

  return new;
end;
$$;

create trigger trg_log_route_event_insert
  after insert on routes
  for each row execute function public.log_route_event();

create trigger trg_log_route_event_update
  after update on routes
  for each row execute function public.log_route_event();

-- ---------------------------------------------
-- 4. Trigger: plan_stops → stop_events
-- ---------------------------------------------
create or replace function public.log_stop_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_type      text;
  v_driver_id uuid;
begin
  -- Obtener driver asociado a la ruta (puede ser null)
  select r.driver_id into v_driver_id
  from routes r where r.id = coalesce(new.route_id, old.route_id);

  if tg_op = 'INSERT' then
    insert into stop_events (org_id, plan_stop_id, route_id, driver_id, type, meta)
    values (new.org_id, new.id, new.route_id, v_driver_id, 'created',
            jsonb_build_object('status', new.status));
    return new;
  end if;

  -- Status transitions
  if new.status is distinct from old.status then
    v_type := case new.status
      when 'completed'  then 'completed'
      when 'incomplete' then 'failed'
      when 'cancelled'  then 'cancelled'
      when 'pending'    then case when old.status in ('completed','incomplete','cancelled') then 'reopened' else null end
      else null
    end;
    if v_type is not null then
      insert into stop_events (org_id, plan_stop_id, route_id, driver_id, type, meta)
      values (new.org_id, new.id, new.route_id, v_driver_id, v_type,
              jsonb_build_object('from', old.status, 'to', new.status,
                                 'cancellation_reason', new.cancellation_reason));
    end if;
  end if;

  -- Route reassignment (drag & drop de una parada a otra ruta)
  if new.route_id is distinct from old.route_id then
    insert into stop_events (org_id, plan_stop_id, route_id, driver_id, type, meta)
    values (new.org_id, new.id, new.route_id, v_driver_id, 'reassigned',
            jsonb_build_object('from_route', old.route_id, 'to_route', new.route_id));
  end if;

  return new;
end;
$$;

create trigger trg_log_stop_event_insert
  after insert on plan_stops
  for each row execute function public.log_stop_event();

create trigger trg_log_stop_event_update
  after update on plan_stops
  for each row execute function public.log_stop_event();

comment on table route_events is
  'Append-only log del ciclo de vida de cada ruta. Alimenta el timeline de actividad.';

comment on table stop_events is
  'Append-only log del ciclo de vida de cada parada. Alimenta el timeline de actividad.';
