-- =============================================
-- Seguridad: guard de membresía en RPCs org-scoped
-- =============================================
--
-- 10 funciones SECURITY DEFINER con EXECUTE para `authenticated` confiaban
-- en el org_id (o en ids de plan/stop/order) que envía el cliente, sin
-- verificar que el caller pertenezca a esa organización. Cualquier usuario
-- autenticado podía, contra una org ajena:
--
--   - leer analytics completos (get_analytics_summary, get_daily_trend,
--     get_driver_performance, get_cancellation_reasons, get_feedback_summary)
--   - usar match_stop_for_order como oráculo de direcciones/clientes y
--     harvestear UUIDs reales de stops
--   - mutar planes (assign_orders_to_plan / unassign_orders_from_plan) y
--     FUSIONAR/BORRAR stops (merge_stops) con esos UUIDs
--   - leer el correlativo de pedidos (generate_order_number)
--
-- Mismo patrón que 20260514040000_secure_rpcs_caller_membership.sql, con una
-- diferencia: match_stop_for_order y generate_order_number también las llama
-- el backend Railway con el cliente service-role (auth.uid() es null ahí),
-- así que el guard vive en un helper que exime a requests sin JWT de usuario
-- (service_role, crons como postgres) y solo exige membresía a los roles
-- PostgREST de usuario (anon/authenticated).
--
-- De paso se fija `search_path = public, pg_temp` en todas (la re-creación de
-- generate_order_number en 20260706020000 había perdido el hardening de
-- 20260425050422, y las de analytics nunca lo tuvieron) y se revoca EXECUTE
-- de anon/public (los default privileges de Supabase lo regalan).

-- ---------------------------------------------
-- 0. Helper: assert_org_member
-- ---------------------------------------------
create or replace function public.assert_org_member(p_org_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  -- Requests sin sesión de usuario (service-role del backend Railway, crons
  -- corriendo como postgres) quedan exentas: auth.uid() es null y no hay
  -- caller que validar. Patrón estándar de Supabase.
  if auth.uid() is null then
    return;
  end if;
  -- Super admin opera cross-org (mismo criterio que las políticas RLS).
  if public.is_super_admin() then
    return;
  end if;
  if p_org_id is null or p_org_id not in (select public.user_org_ids()) then
    raise exception 'No autorizado para esta organización'
      using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.assert_org_member(uuid) from public, anon;
grant execute on function public.assert_org_member(uuid) to authenticated;

comment on function public.assert_org_member(uuid) is
  'Guard de RPCs org-scoped: exige que el caller autenticado sea miembro de la org (o super admin). Exime service-role/crons (sin JWT de usuario).';

-- ---------------------------------------------
-- 1. get_analytics_summary
-- ---------------------------------------------
create or replace function get_analytics_summary(
  p_org_id uuid,
  p_from date default null,
  p_to date default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result json;
begin
  perform public.assert_org_member(p_org_id);
  select json_build_object(
    'total_plans', (
      select count(*) from plans
      where org_id = p_org_id
        and (p_from is null or date >= p_from)
        and (p_to is null or date <= p_to)
    ),
    'total_routes', (
      select count(*) from routes r
      join plans p on r.plan_id = p.id
      where r.org_id = p_org_id
        and (p_from is null or p.date >= p_from)
        and (p_to is null or p.date <= p_to)
    ),
    'total_stops', (
      select count(*) from plan_stops ps
      join plans p on ps.plan_id = p.id
      where ps.org_id = p_org_id
        and (p_from is null or p.date >= p_from)
        and (p_to is null or p.date <= p_to)
    ),
    'stops_completed', (
      select count(*) from plan_stops ps
      join plans p on ps.plan_id = p.id
      where ps.org_id = p_org_id and ps.status = 'completed'
        and (p_from is null or p.date >= p_from)
        and (p_to is null or p.date <= p_to)
    ),
    'stops_cancelled', (
      select count(*) from plan_stops ps
      join plans p on ps.plan_id = p.id
      where ps.org_id = p_org_id and ps.status = 'cancelled'
        and (p_from is null or p.date >= p_from)
        and (p_to is null or p.date <= p_to)
    ),
    'stops_incomplete', (
      select count(*) from plan_stops ps
      join plans p on ps.plan_id = p.id
      where ps.org_id = p_org_id and ps.status = 'incomplete'
        and (p_from is null or p.date >= p_from)
        and (p_to is null or p.date <= p_to)
    ),
    'stops_pending', (
      select count(*) from plan_stops ps
      join plans p on ps.plan_id = p.id
      where ps.org_id = p_org_id and ps.status = 'pending'
        and (p_from is null or p.date >= p_from)
        and (p_to is null or p.date <= p_to)
    ),
    'total_distance_km', (
      select coalesce(sum(r.total_distance_km), 0) from routes r
      join plans p on r.plan_id = p.id
      where r.org_id = p_org_id
        and (p_from is null or p.date >= p_from)
        and (p_to is null or p.date <= p_to)
    ),
    'total_duration_min', (
      select coalesce(sum(r.total_duration_minutes), 0) from routes r
      join plans p on r.plan_id = p.id
      where r.org_id = p_org_id
        and (p_from is null or p.date >= p_from)
        and (p_to is null or p.date <= p_to)
    ),
    'total_vehicles', (select count(*) from vehicles where org_id = p_org_id),
    'total_drivers', (select count(*) from drivers where org_id = p_org_id and status = 'active'),
    'avg_rating', (
      select round(avg(rating)::numeric, 1) from delivery_feedback
      where org_id = p_org_id
        and (p_from is null or submitted_at >= p_from)
        and (p_to is null or submitted_at <= p_to + interval '1 day')
    ),
    'total_feedback', (
      select count(*) from delivery_feedback
      where org_id = p_org_id
        and (p_from is null or submitted_at >= p_from)
        and (p_to is null or submitted_at <= p_to + interval '1 day')
    )
  ) into result;
  return result;
end;
$$;

revoke execute on function get_analytics_summary(uuid, date, date) from public, anon;

-- ---------------------------------------------
-- 2. get_daily_trend
-- ---------------------------------------------
create or replace function get_daily_trend(
  p_org_id uuid,
  p_from date,
  p_to date
)
returns table(
  day date,
  total_stops bigint,
  completed bigint,
  cancelled bigint,
  incomplete bigint,
  pending bigint,
  distance_km numeric,
  duration_min numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_org_member(p_org_id);
  return query
  with day_routes as (
    select p.date as day, sum(r.total_distance_km) as distance_km, sum(r.total_duration_minutes) as duration_min
    from plans p
    left join routes r on r.plan_id = p.id
    where p.org_id = p_org_id
      and p.date between p_from and p_to
    group by p.date
  ),
  day_stops as (
    select
      p.date as day,
      count(ps.id) as total_stops,
      count(ps.id) filter (where ps.status = 'completed') as completed,
      count(ps.id) filter (where ps.status = 'cancelled') as cancelled,
      count(ps.id) filter (where ps.status = 'incomplete') as incomplete,
      count(ps.id) filter (where ps.status = 'pending') as pending
    from plans p
    left join plan_stops ps on ps.plan_id = p.id
    where p.org_id = p_org_id
      and p.date between p_from and p_to
    group by p.date
  )
  select
    ds.day,
    ds.total_stops,
    ds.completed,
    ds.cancelled,
    ds.incomplete,
    ds.pending,
    coalesce(dr.distance_km, 0)::numeric,
    coalesce(dr.duration_min, 0)::numeric
  from day_stops ds
  left join day_routes dr on dr.day = ds.day
  order by ds.day;
end;
$$;

revoke execute on function get_daily_trend(uuid, date, date) from public, anon;

-- ---------------------------------------------
-- 3. get_driver_performance (cuerpo de 20260524000000)
-- ---------------------------------------------
create or replace function get_driver_performance(
  p_org_id uuid,
  p_from date default null,
  p_to date default null
)
returns table(
  driver_id uuid,
  driver_name text,
  total_stops bigint,
  completed bigint,
  cancelled bigint,
  incomplete bigint,
  success_rate numeric,
  avg_rating numeric,
  total_distance_km numeric,
  total_feedback bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.assert_org_member(p_org_id);
  return query
  with driver_routes as (
    select r.id as route_id, r.driver_id, r.total_distance_km
    from routes r
    join plans p on p.id = r.plan_id
    where r.org_id = p_org_id
      and (p_from is null or p.date >= p_from)
      and (p_to is null or p.date <= p_to)
  ),
  driver_stops as (
    select
      dr.driver_id as drv_id,
      count(ps.id) as total_stops,
      count(ps.id) filter (where ps.status = 'completed') as completed,
      count(ps.id) filter (where ps.status = 'cancelled') as cancelled,
      count(ps.id) filter (where ps.status = 'incomplete') as incomplete
    from driver_routes dr
    left join plan_stops ps on ps.route_id = dr.route_id
    group by dr.driver_id
  ),
  driver_distance as (
    select dr.driver_id as drv_id, sum(dr.total_distance_km) as distance_km
    from driver_routes dr
    group by dr.driver_id
  )
  select
    d.id,
    (d.first_name || ' ' || d.last_name)::text,
    coalesce(ds.total_stops, 0),
    coalesce(ds.completed, 0),
    coalesce(ds.cancelled, 0),
    coalesce(ds.incomplete, 0),
    case
      when coalesce(ds.total_stops, 0) > 0
        then round(100.0 * ds.completed / ds.total_stops, 1)
      else 0
    end,
    (
      select round(avg(df.rating)::numeric, 1) from delivery_feedback df
      where df.driver_id = d.id
        and (p_from is null or df.submitted_at >= p_from)
        and (p_to is null or df.submitted_at <= p_to + interval '1 day')
    ),
    coalesce(dd.distance_km, 0)::numeric,
    (select count(*) from delivery_feedback df where df.driver_id = d.id)
  from drivers d
  left join driver_stops ds on ds.drv_id = d.id
  left join driver_distance dd on dd.drv_id = d.id
  where d.org_id = p_org_id
    and d.status = 'active'
  order by coalesce(ds.completed, 0) desc;
end;
$$;

revoke execute on function get_driver_performance(uuid, date, date) from public, anon;

-- ---------------------------------------------
-- 4. get_cancellation_reasons
-- ---------------------------------------------
create or replace function get_cancellation_reasons(
  p_org_id uuid,
  p_from date default null,
  p_to date default null
)
returns table(
  reason text,
  count bigint,
  percentage numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  total bigint;
begin
  perform public.assert_org_member(p_org_id);
  select count(*) into total
  from plan_stops ps
  join plans p on ps.plan_id = p.id
  where ps.org_id = p_org_id
    and ps.status in ('cancelled', 'incomplete')
    and (p_from is null or p.date >= p_from)
    and (p_to is null or p.date <= p_to);

  return query
  select
    coalesce(ps.cancellation_reason, 'Sin motivo especificado')::text,
    count(*),
    case when total > 0 then round(100.0 * count(*) / total, 1) else 0 end
  from plan_stops ps
  join plans p on ps.plan_id = p.id
  where ps.org_id = p_org_id
    and ps.status in ('cancelled', 'incomplete')
    and (p_from is null or p.date >= p_from)
    and (p_to is null or p.date <= p_to)
  group by ps.cancellation_reason
  order by count(*) desc;
end;
$$;

revoke execute on function get_cancellation_reasons(uuid, date, date) from public, anon;

-- ---------------------------------------------
-- 5. get_feedback_summary
-- ---------------------------------------------
create or replace function get_feedback_summary(
  p_org_id uuid,
  p_from date default null,
  p_to date default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result json;
begin
  perform public.assert_org_member(p_org_id);
  select json_build_object(
    'avg_rating', (
      select round(avg(rating)::numeric, 1) from delivery_feedback
      where org_id = p_org_id
        and (p_from is null or submitted_at >= p_from)
        and (p_to is null or submitted_at <= p_to + interval '1 day')
    ),
    'total_responses', (
      select count(*) from delivery_feedback
      where org_id = p_org_id
        and (p_from is null or submitted_at >= p_from)
        and (p_to is null or submitted_at <= p_to + interval '1 day')
    ),
    'rating_1', (
      select count(*) from delivery_feedback
      where org_id = p_org_id and rating = 1
        and (p_from is null or submitted_at >= p_from)
        and (p_to is null or submitted_at <= p_to + interval '1 day')
    ),
    'rating_2', (
      select count(*) from delivery_feedback
      where org_id = p_org_id and rating = 2
        and (p_from is null or submitted_at >= p_from)
        and (p_to is null or submitted_at <= p_to + interval '1 day')
    ),
    'rating_3', (
      select count(*) from delivery_feedback
      where org_id = p_org_id and rating = 3
        and (p_from is null or submitted_at >= p_from)
        and (p_to is null or submitted_at <= p_to + interval '1 day')
    ),
    'rating_4', (
      select count(*) from delivery_feedback
      where org_id = p_org_id and rating = 4
        and (p_from is null or submitted_at >= p_from)
        and (p_to is null or submitted_at <= p_to + interval '1 day')
    ),
    'rating_5', (
      select count(*) from delivery_feedback
      where org_id = p_org_id and rating = 5
        and (p_from is null or submitted_at >= p_from)
        and (p_to is null or submitted_at <= p_to + interval '1 day')
    ),
    'nps', (
      select coalesce(
        round(100.0 * count(*) filter (where rating = 5) / nullif(count(*), 0), 0) -
        round(100.0 * count(*) filter (where rating <= 3) / nullif(count(*), 0), 0),
        0
      )
      from delivery_feedback
      where org_id = p_org_id
        and (p_from is null or submitted_at >= p_from)
        and (p_to is null or submitted_at <= p_to + interval '1 day')
    )
  ) into result;
  return result;
end;
$$;

revoke execute on function get_feedback_summary(uuid, date, date) from public, anon;

-- ---------------------------------------------
-- 6. generate_order_number (cuerpo de 20260706020000)
--    Llamada también por el backend con service-role (exento vía helper).
--    La re-creación de 20260706020000 había perdido el search_path fijado
--    en 20260425050422 — se restaura aquí.
-- ---------------------------------------------
create or replace function public.generate_order_number(p_org_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  next_num integer;
begin
  perform public.assert_org_member(p_org_id);
  select coalesce(
           max((substring(order_number from '^ORD-([0-9]+)$'))::integer),
           0
         ) + 1
    into next_num
    from orders
   where org_id = p_org_id
     and order_number ~ '^ORD-[0-9]+$';

  return 'ORD-' || lpad(next_num::text, 5, '0');
end;
$$;

revoke execute on function public.generate_order_number(uuid) from public, anon;

-- ---------------------------------------------
-- 7. match_stop_for_order (cuerpo de 022)
--    Llamada también por el backend con service-role (exento vía helper).
-- ---------------------------------------------
create or replace function public.match_stop_for_order(
  p_org_id         uuid,
  p_address        text,
  p_customer_name  text,
  p_customer_id    uuid,
  p_lat            numeric,
  p_lng            numeric
) returns table (
  stop_id           uuid,
  match_quality     text,
  should_create_new boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash      text := public.vuoo_normalize_address(p_address);
  v_candidate uuid;
begin
  perform public.assert_org_member(p_org_id);

  -- ─── Nivel alto: hash exacto + customer_id exacto ──────────
  if p_customer_id is not null then
    select s.id into v_candidate
      from stops s
     where s.org_id = p_org_id
       and s.address_hash = v_hash
       and s.customer_id = p_customer_id
     order by s.is_curated desc, s.use_count desc
     limit 1;

    if v_candidate is not null then
      return query select v_candidate, 'high'::text, false;
      return;
    end if;
  end if;

  -- ─── Nivel alto: hash exacto + nombre similar (≥ 0.85) ─────
  select s.id into v_candidate
    from stops s
   where s.org_id = p_org_id
     and s.address_hash = v_hash
     and (
       p_customer_name is null
       or similarity(lower(coalesce(s.customer_name, '')), lower(p_customer_name)) >= 0.85
     )
   order by s.is_curated desc, s.use_count desc
   limit 1;

  if v_candidate is not null then
    return query select v_candidate, 'high'::text, false;
    return;
  end if;

  -- ─── Nivel medio: hash exacto, nombre distinto ─────────────
  select s.id into v_candidate
    from stops s
   where s.org_id = p_org_id
     and s.address_hash = v_hash
   order by s.is_curated desc, s.use_count desc
   limit 1;

  if v_candidate is not null then
    return query select v_candidate, 'medium'::text, false;
    return;
  end if;

  -- ─── Sin match → crear nuevo (nunca bloquea) ───────────────
  return query select null::uuid, 'none'::text, true;
end;
$$;

revoke execute on function public.match_stop_for_order(uuid, text, text, uuid, numeric, numeric) from public, anon;

-- ---------------------------------------------
-- 8. assign_orders_to_plan (cuerpo de 023)
-- ---------------------------------------------
create or replace function public.assign_orders_to_plan(
  p_order_ids       uuid[],
  p_plan_id         uuid,
  p_allow_override  boolean default false
) returns table (
  order_id       uuid,
  stop_id        uuid,
  plan_stop_id   uuid,
  action         text,
  match_quality  text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id              uuid;
  v_order               record;
  v_existing_plan_stop  uuid;
begin
  select org_id into v_org_id from plans where id = p_plan_id;
  if v_org_id is null then
    raise exception 'plan_not_found: %', p_plan_id;
  end if;
  perform public.assert_org_member(v_org_id);

  for v_order in
    select o.* from orders o
     where o.id = any(p_order_ids)
       and o.org_id = v_org_id
  loop
    -- Skip si ya está asignada y no se forzó override.
    if v_order.plan_stop_id is not null and not p_allow_override then
      order_id      := v_order.id;
      stop_id       := v_order.stop_id;
      plan_stop_id  := v_order.plan_stop_id;
      action        := 'skipped_already_assigned';
      match_quality := v_order.match_quality;
      return next;
      continue;
    end if;

    -- Toda orden en esta fase debe traer stop_id (Fase B lo garantiza).
    if v_order.stop_id is null then
      raise exception 'order_without_stop: %', v_order.id;
    end if;

    -- Buscar plan_stop existente en este plan con mismo stop_id y
    -- ventana compatible (solapadas o ambas null).
    select ps.id into v_existing_plan_stop
      from plan_stops ps
     where ps.plan_id = p_plan_id
       and ps.stop_id = v_order.stop_id
       and (
         (ps.time_window_start is null and v_order.time_window_start is null)
         or (
           ps.time_window_start is not null
           and v_order.time_window_start is not null
           and tstzrange(
                 (current_date + ps.time_window_start)::timestamptz,
                 (current_date + coalesce(ps.time_window_end, ps.time_window_start))::timestamptz,
                 '[]'
               )
               && tstzrange(
                 (current_date + v_order.time_window_start)::timestamptz,
                 (current_date + coalesce(v_order.time_window_end, v_order.time_window_start))::timestamptz,
                 '[]'
               )
         )
       )
     limit 1;

    if v_existing_plan_stop is not null then
      -- Merge: items concatenados, pesos sumados, skills unidas
      -- (plan_stop ∪ stop.required_skills), priority max con la del stop.
      update plan_stops ps set
        items           = ps.items || v_order.items,
        weight_kg       = coalesce(ps.weight_kg, 0) + coalesce(v_order.total_weight_kg, 0),
        volume_m3       = coalesce(ps.volume_m3, 0) + coalesce(v_order.total_volume_m3, 0),
        required_skills = coalesce(
                            (select array_agg(distinct s)
                               from unnest(
                                 coalesce(ps.required_skills, '{}'::text[])
                                 || coalesce(
                                      (select s2.required_skills
                                         from stops s2
                                        where s2.id = v_order.stop_id),
                                      '{}'::text[]
                                    )
                               ) s),
                            '{}'::text[]
                          ),
        priority        = greatest(
                            ps.priority,
                            coalesce((select s3.priority from stops s3 where s3.id = v_order.stop_id), 0)
                          ),
        order_count     = ps.order_count + 1
       where ps.id = v_existing_plan_stop;

      update orders set plan_stop_id = v_existing_plan_stop
       where id = v_order.id;

      order_id      := v_order.id;
      stop_id       := v_order.stop_id;
      plan_stop_id  := v_existing_plan_stop;
      action        := 'merged_existing';
      match_quality := v_order.match_quality;
      return next;
    else
      -- Crear plan_stop nuevo, heredando datos del order y del stop
      -- (skills + priority vienen del stop, que es la fuente canónica).
      insert into plan_stops (
        plan_id, stop_id, org_id,
        items, weight_kg, volume_m3,
        required_skills, priority,
        time_window_start, time_window_end,
        service_minutes, order_count
      )
      select
        p_plan_id, v_order.stop_id, v_org_id,
        v_order.items,
        v_order.total_weight_kg,
        v_order.total_volume_m3,
        coalesce(s.required_skills, '{}'::text[]),
        coalesce(s.priority, 0),
        v_order.time_window_start, v_order.time_window_end,
        coalesce(v_order.service_duration_minutes, 5),
        1
      from stops s
      where s.id = v_order.stop_id
      returning id into v_existing_plan_stop;

      update orders set plan_stop_id = v_existing_plan_stop
       where id = v_order.id;

      order_id      := v_order.id;
      stop_id       := v_order.stop_id;
      plan_stop_id  := v_existing_plan_stop;
      action        := 'created_new';
      match_quality := v_order.match_quality;
      return next;
    end if;
  end loop;

  -- Refresh stats en stops tocados (cache de uso).
  update stops s set
    last_used_at = now(),
    use_count    = s.use_count + coalesce(sub.cnt, 0)
    from (
      select o.stop_id, count(*)::integer as cnt
        from orders o
       where o.id = any(p_order_ids)
         and o.stop_id is not null
       group by o.stop_id
    ) sub
   where s.id = sub.stop_id;
end;
$$;

revoke execute on function public.assign_orders_to_plan(uuid[], uuid, boolean) from public, anon;

-- ---------------------------------------------
-- 9. unassign_orders_from_plan (cuerpo de 023; antes no validaba org)
-- ---------------------------------------------
create or replace function public.unassign_orders_from_plan(
  p_order_ids  uuid[],
  p_plan_id    uuid
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org_id uuid;
  v_count  integer := 0;
begin
  select org_id into v_org_id from plans where id = p_plan_id;
  if v_org_id is null then
    raise exception 'plan_not_found: %', p_plan_id;
  end if;
  perform public.assert_org_member(v_org_id);

  update orders
     set plan_stop_id = null
   where id = any(p_order_ids)
     and plan_stop_id in (
       select id from plan_stops where plan_id = p_plan_id
     );
  get diagnostics v_count = row_count;

  -- Limpiar plan_stops huérfanos (sin orders ni otros motivos de permanencia).
  delete from plan_stops ps
   where ps.plan_id = p_plan_id
     and not exists (
       select 1 from orders o where o.plan_stop_id = ps.id
     );

  return v_count;
end;
$$;

revoke execute on function public.unassign_orders_from_plan(uuid[], uuid) from public, anon;

-- ---------------------------------------------
-- 10. merge_stops (cuerpo de 023; validaba misma org entre stops
--     pero no la membresía del caller)
-- ---------------------------------------------
create or replace function public.merge_stops(
  p_loser_id   uuid,
  p_winner_id  uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_loser   stops%rowtype;
  v_winner  stops%rowtype;
begin
  if p_loser_id = p_winner_id then
    raise exception 'merge_stops: loser and winner are the same (%)', p_loser_id;
  end if;

  select * into v_loser  from stops where id = p_loser_id  for update;
  select * into v_winner from stops where id = p_winner_id for update;

  if v_loser.id is null then
    raise exception 'merge_stops: loser not found (%)', p_loser_id;
  end if;
  if v_winner.id is null then
    raise exception 'merge_stops: winner not found (%)', p_winner_id;
  end if;
  if v_loser.org_id <> v_winner.org_id then
    raise exception 'merge_stops: cross-org merge blocked (% vs %)',
      v_loser.org_id, v_winner.org_id;
  end if;
  perform public.assert_org_member(v_loser.org_id);

  -- Rewire de referencias.
  update orders     set stop_id = v_winner.id where stop_id = v_loser.id;
  update plan_stops set stop_id = v_winner.id where stop_id = v_loser.id;

  -- Mezcla de campos: sumar uso, unir skills, OR sobre is_curated.
  update stops set
    use_count       = v_winner.use_count + coalesce(v_loser.use_count, 0),
    is_curated      = v_winner.is_curated or v_loser.is_curated,
    required_skills = coalesce(
                        (select array_agg(distinct s)
                           from unnest(
                             coalesce(v_winner.required_skills, '{}'::text[])
                             || coalesce(v_loser.required_skills, '{}'::text[])
                           ) s),
                        '{}'::text[]
                      ),
    last_used_at    = greatest(
                        coalesce(v_winner.last_used_at, '-infinity'::timestamptz),
                        coalesce(v_loser.last_used_at,  '-infinity'::timestamptz)
                      ),
    -- Campos "blandos": solo copiar desde loser si winner los tiene null.
    customer_name         = coalesce(v_winner.customer_name, v_loser.customer_name),
    customer_phone        = coalesce(v_winner.customer_phone, v_loser.customer_phone),
    customer_email        = coalesce(v_winner.customer_email, v_loser.customer_email),
    delivery_instructions = coalesce(v_winner.delivery_instructions, v_loser.delivery_instructions),
    customer_id           = coalesce(v_winner.customer_id, v_loser.customer_id),
    geocoding_confidence  = coalesce(v_winner.geocoding_confidence, v_loser.geocoding_confidence),
    geocoding_provider    = coalesce(v_winner.geocoding_provider, v_loser.geocoding_provider)
  where id = v_winner.id;

  -- Finalmente, borrar al loser.
  delete from stops where id = v_loser.id;
end;
$$;

revoke execute on function public.merge_stops(uuid, uuid) from public, anon;
