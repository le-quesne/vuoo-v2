-- =============================================
-- Vuoo V2 - Analytics RPC Functions
-- =============================================
-- Moves analytics aggregations from the client
-- into Postgres to avoid fetching all plan_stops
-- and filtering in JS.
-- =============================================

-- 1. Resumen general de la org con filtro de fechas
-- ---------------------------------------------
create or replace function get_analytics_summary(
  p_org_id uuid,
  p_from date default null,
  p_to date default null
)
returns json
language plpgsql
security definer
as $$
declare
  result json;
begin
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

-- 2. Tendencia diaria para line/stacked charts
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
as $$
begin
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

-- 3. Performance por conductor
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
as $$
begin
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
      dr.driver_id,
      count(ps.id) as total_stops,
      count(ps.id) filter (where ps.status = 'completed') as completed,
      count(ps.id) filter (where ps.status = 'cancelled') as cancelled,
      count(ps.id) filter (where ps.status = 'incomplete') as incomplete
    from driver_routes dr
    left join plan_stops ps on ps.route_id = dr.route_id
    group by dr.driver_id
  ),
  driver_distance as (
    select driver_id, sum(total_distance_km) as total_distance_km
    from driver_routes
    group by driver_id
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
    coalesce(dd.total_distance_km, 0)::numeric,
    (select count(*) from delivery_feedback df where df.driver_id = d.id)
  from drivers d
  left join driver_stops ds on ds.driver_id = d.id
  left join driver_distance dd on dd.driver_id = d.id
  where d.org_id = p_org_id
    and d.status = 'active'
  order by coalesce(ds.completed, 0) desc;
end;
$$;

-- 4. Motivos de cancelacion
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
as $$
declare
  total bigint;
begin
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

-- 5. Resumen de feedback (NPS + distribucion)
-- ---------------------------------------------
create or replace function get_feedback_summary(
  p_org_id uuid,
  p_from date default null,
  p_to date default null
)
returns json
language plpgsql
security definer
as $$
declare
  result json;
begin
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

-- 6. Permissions
-- ---------------------------------------------
grant execute on function get_analytics_summary(uuid, date, date) to authenticated;
grant execute on function get_daily_trend(uuid, date, date) to authenticated;
grant execute on function get_driver_performance(uuid, date, date) to authenticated;
grant execute on function get_cancellation_reasons(uuid, date, date) to authenticated;
grant execute on function get_feedback_summary(uuid, date, date) to authenticated;
