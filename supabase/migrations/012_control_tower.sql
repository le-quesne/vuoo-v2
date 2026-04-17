-- =============================================
-- Control Tower (Torre de Control)
-- =============================================
--
-- Fase 1 del PRD 08: soporta la pagina /control, un dashboard en vivo
-- que agrega el estado de la operacion del dia en una sola vista:
--
--   - KPIs de drivers (online/total) y paradas (completadas/pendientes/fallidas)
--   - Listado de rutas activas con driver, vehiculo, progreso y ultima ubicacion
--
-- Implementamos dos RPCs (get_live_dashboard, get_live_routes) para evitar
-- N+1 queries desde el cliente y poder combinarlos con realtime sobre la
-- tabla routes. Ambas funciones siguen el patron de get_vehicle_depot
-- (migration 010): security definer + search_path = public.
--
-- Tambien habilitamos realtime en routes para que el frontend pueda
-- suscribirse a cambios de status (not_started -> in_transit -> completed)
-- y refrescar la vista sin polling.

-- 1. Habilitar realtime en routes
-- ---------------------------------------------
alter publication supabase_realtime add table routes;

-- 2. RPC: get_live_dashboard
-- ---------------------------------------------
-- KPIs agregados del dia para el header de la torre de control.
create or replace function get_live_dashboard(
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
  select json_build_object(
    'drivers_online', (
      select count(distinct dl.driver_id)
      from driver_locations dl
      join drivers d on d.id = dl.driver_id
      where d.org_id = p_org_id
        and dl.recorded_at >= now() - interval '60 seconds'
    ),
    'drivers_total', (
      select count(distinct r.driver_id)
      from routes r
      join plans p on p.id = r.plan_id
      where r.org_id = p_org_id
        and p.date = p_date
        and r.driver_id is not null
    ),
    'stops_total', (
      select count(*)
      from plan_stops ps
      join plans p on p.id = ps.plan_id
      where ps.org_id = p_org_id
        and p.date = p_date
    ),
    'stops_completed', (
      select count(*)
      from plan_stops ps
      join plans p on p.id = ps.plan_id
      where ps.org_id = p_org_id
        and p.date = p_date
        and ps.status = 'completed'
    ),
    'stops_failed', (
      select count(*)
      from plan_stops ps
      join plans p on p.id = ps.plan_id
      where ps.org_id = p_org_id
        and p.date = p_date
        and ps.status in ('incomplete', 'cancelled')
    ),
    'stops_pending', (
      select count(*)
      from plan_stops ps
      join plans p on p.id = ps.plan_id
      where ps.org_id = p_org_id
        and p.date = p_date
        and ps.status = 'pending'
    ),
    'routes_active', (
      select count(*)
      from routes r
      join plans p on p.id = r.plan_id
      where r.org_id = p_org_id
        and p.date = p_date
        and r.status = 'in_transit'
    ),
    'routes_completed', (
      select count(*)
      from routes r
      join plans p on p.id = r.plan_id
      where r.org_id = p_org_id
        and p.date = p_date
        and r.status = 'completed'
    )
  ) into result;
  return result;
end;
$$;

comment on function get_live_dashboard(uuid, date) is
  'KPIs en vivo de la torre de control: drivers online/total y paradas/rutas del dia.';

-- 3. RPC: get_live_routes
-- ---------------------------------------------
-- Retorna el listado de rutas del dia con driver, vehiculo, progreso de
-- paradas y ultima ubicacion conocida del driver. Ordenadas por estado:
-- in_transit primero, luego not_started, completed al final.
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
          'plate', v.license_plate
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
  'Listado de rutas del dia para la torre de control con progreso y ultima ubicacion.';

-- 4. Permissions
-- ---------------------------------------------
grant execute on function get_live_dashboard(uuid, date) to authenticated;
grant execute on function get_live_routes(uuid, date) to authenticated;
