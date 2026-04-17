-- =============================================
-- Driver availability (online / on_break / off_shift)
-- =============================================
--
-- Hasta ahora la Torre de Control infería "online" comparando
-- driver_locations.recorded_at con un umbral de 60s (ver
-- src/lib/liveControl.ts:ONLINE_THRESHOLD_MS). Eso mezcla tres
-- estados distintos:
--   - En break con el celular guardado (sin GPS pero disponible).
--   - Sin señal momentánea (túnel, subsuelo).
--   - Fuera de jornada (terminó el turno).
--
-- Con una columna explícita `availability` el chofer puede declarar
-- su estado desde la app y el dispatcher ve la realidad operacional,
-- no una inferencia basada en el GPS. Sigue sirviendo como fuente
-- complementaria: un driver "online" que lleva >5min sin GPS todavía
-- se marca como "sin señal" en la UI.

alter table drivers add column availability text
  not null default 'off_shift'
  check (availability in ('off_shift', 'online', 'on_break', 'busy'));

alter table drivers add column availability_updated_at timestamptz;

-- Trigger: mantener availability_updated_at fresco al cambiar el valor.
create or replace function public.drivers_touch_availability()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.availability is distinct from old.availability then
    new.availability_updated_at := now();
  end if;
  return new;
end;
$$;

create trigger trg_drivers_touch_availability
  before update on drivers
  for each row execute function public.drivers_touch_availability();

-- Realtime: el toggle del chofer debe propagarse a la Torre y DriversPage
-- sin polling.
alter publication supabase_realtime add table drivers;

-- REPLICA IDENTITY FULL para que los handlers de postgres_changes
-- puedan comparar payload.old vs payload.new (mismo patrón que se
-- usa en ControlPage:300 con plan_stops).
alter table drivers replica identity full;

comment on column drivers.availability is
  'Estado declarado por el chofer: off_shift | online | on_break | busy. Se actualiza desde la app móvil.';

-- Extender get_live_routes con availability del driver
-- ---------------------------------------------
-- Necesario para que la Torre de Control distinga "sin señal GPS"
-- (último ping > 60s) de "en break declarado" o "fuera de jornada".
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
          'phone', d.phone,
          'availability', d.availability,
          'availability_updated_at', d.availability_updated_at
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

grant execute on function get_live_routes(uuid, date) to authenticated;
