-- Fix: "column reference 'driver_id' is ambiguous" en get_driver_performance.
-- El CTE driver_distance usaba `driver_id` sin calificar, lo que colisionaba con
-- la columna de salida `driver_id` declarada en RETURNS TABLE.

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

grant execute on function get_driver_performance(uuid, date, date) to authenticated;
