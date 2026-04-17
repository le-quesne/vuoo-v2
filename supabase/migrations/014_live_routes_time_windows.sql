-- =============================================
-- Extend get_live_routes with vehicle time windows
-- =============================================
--
-- La Torre de Control necesita detectar alertas de:
--
--   - route_not_started: hora actual > vehicle.time_window_start + 30min
--     y route.status = 'not_started'.
--
-- Para eso expone los campos time_window_start / time_window_end del
-- vehiculo en el RPC get_live_routes, manteniendo compatibilidad con
-- los campos existentes.

create or replace function get_live_routes(
  p_org_id uuid,
  p_date date
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  select coalesce(json_agg(row_to_json(t)), '[]'::json)
  into result
  from (
    select
      r.id as route_id,
      r.status as route_status,
      r.total_distance_km,
      r.total_duration_minutes,
      p.id as plan_id,
      p.name as plan_name,
      p.date as plan_date,
      case
        when d.id is null then null
        else json_build_object(
          'id', d.id,
          'name', (d.first_name || ' ' || d.last_name),
          'phone', d.phone
        )
      end as driver,
      case
        when v.id is null then null
        else json_build_object(
          'id', v.id,
          'name', v.name,
          'plate', v.license_plate,
          'time_window_start', v.time_window_start,
          'time_window_end', v.time_window_end
        )
      end as vehicle,
      (
        select count(*)
        from plan_stops ps
        where ps.route_id = r.id
      ) as stops_total,
      (
        select count(*)
        from plan_stops ps
        where ps.route_id = r.id
          and ps.status = 'completed'
      ) as stops_completed,
      (
        select count(*)
        from plan_stops ps
        where ps.route_id = r.id
          and ps.status in ('incomplete', 'cancelled')
      ) as stops_failed,
      (
        select case
          when dl.id is null then null
          else json_build_object(
            'lat', dl.lat,
            'lng', dl.lng,
            'speed', dl.speed,
            'battery', dl.battery,
            'recorded_at', dl.recorded_at
          )
        end
        from driver_locations dl
        where r.driver_id is not null
          and dl.driver_id = r.driver_id
        order by dl.recorded_at desc
        limit 1
      ) as last_location
    from routes r
    join plans p on p.id = r.plan_id
    left join drivers d on d.id = r.driver_id
    left join vehicles v on v.id = r.vehicle_id
    where r.org_id = p_org_id
      and p.date = p_date
    order by
      case r.status
        when 'in_transit' then 0
        when 'not_started' then 1
        else 2
      end,
      r.created_at
  ) t;
  return result;
end;
$$;

comment on function get_live_routes(uuid, date) is
  'Listado de rutas del dia para la torre de control con progreso, ultima ubicacion y time windows del vehiculo.';

grant execute on function get_live_routes(uuid, date) to authenticated;
