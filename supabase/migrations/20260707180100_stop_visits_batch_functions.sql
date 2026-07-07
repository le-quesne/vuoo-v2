-- =============================================
-- PRD 26 — Fase 3/4: funciones de cómputo + cron nocturno
-- =============================================
--
-- Constantes del MVP (radio de geofence, umbral mínimo de permanencia):
-- fijas globales a propósito (decisión de producto en PRD 26), a calibrar
-- con datos reales una vez que haya volumen — no bloquea el diseño.

-- ---------------------------------------------
-- 1. Distancia en metros entre dos puntos lat/lng (haversine).
-- ---------------------------------------------
create or replace function public.vuoo_distance_meters(
  p_lat1 double precision, p_lng1 double precision,
  p_lat2 double precision, p_lng2 double precision
) returns double precision
language sql
immutable
set search_path = public, pg_temp
as $$
  select 6371000 * 2 * asin(sqrt(
    sin(radians(p_lat2 - p_lat1) / 2) ^ 2 +
    cos(radians(p_lat1)) * cos(radians(p_lat2)) *
    sin(radians(p_lng2 - p_lng1) / 2) ^ 2
  ));
$$;

-- ---------------------------------------------
-- 2. Detección de visitas para UNA ruta completada.
-- ---------------------------------------------
-- Heurística (no perfecta, documentada): recorre los stops de la ruta en
-- su `order_index`, y para cada uno busca en driver_locations la primera
-- racha contigua de pings dentro del radio de geofence, buscando SOLO a
-- partir de la salida detectada del stop anterior (así un camión que pasa
-- cerca de una dirección antes de llegar a ella —camino a otro stop— no se
-- cuenta como visita anticipada). Descarta rachas más cortas que el umbral
-- mínimo de permanencia (probablemente tránsito, no una entrega real).
create or replace function public.compute_stop_visits_for_route(p_route_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_radius_m     constant double precision := 100;  -- geofence fijo MVP
  v_min_dwell_s  constant int := 90;                -- umbral mínimo MVP
  v_org_id       uuid;
  v_driver_id    uuid;
  v_stop         record;
  v_ping         record;
  v_cursor_from  timestamptz := '-infinity'::timestamptz;
  v_arrived      timestamptz;
  v_last_in      timestamptz;
  v_departed     timestamptz;
  v_in_radius    boolean;
begin
  select r.org_id into v_org_id from routes r where r.id = p_route_id;
  if v_org_id is null then
    return;
  end if;

  select dl.driver_id into v_driver_id
    from driver_locations dl
   where dl.route_id = p_route_id
   order by dl.recorded_at asc
   limit 1;

  for v_stop in
    select ps.stop_id as stop_id, s.customer_id, s.lat, s.lng
      from plan_stops ps
      join stops s on s.id = ps.stop_id
     where ps.route_id = p_route_id
       and ps.status = 'completed'
       and s.lat is not null and s.lng is not null
     order by ps.order_index nulls last
  loop
    v_arrived := null;
    v_last_in := null;
    v_departed := null;

    for v_ping in
      select recorded_at, lat, lng
        from driver_locations
       where route_id = p_route_id
         and recorded_at >= v_cursor_from
       order by recorded_at asc
    loop
      v_in_radius :=
        public.vuoo_distance_meters(v_ping.lat, v_ping.lng, v_stop.lat, v_stop.lng) <= v_radius_m;

      if v_in_radius then
        if v_arrived is null then
          v_arrived := v_ping.recorded_at;
        end if;
        v_last_in := v_ping.recorded_at;
      elsif v_arrived is not null then
        -- Salió del radio después de haber entrado: cerramos la visita acá,
        -- primera racha contigua encontrada.
        v_departed := v_last_in;
        exit;
      end if;
    end loop;

    if v_arrived is not null and v_departed is null then
      -- Último ping disponible de la ruta seguía dentro del radio.
      v_departed := v_last_in;
    end if;

    if v_arrived is not null and v_departed is not null
       and extract(epoch from (v_departed - v_arrived)) >= v_min_dwell_s then
      insert into stop_visits (
        org_id, stop_id, customer_id, driver_id, route_id,
        arrived_at, departed_at, dwell_seconds, radius_m, source
      ) values (
        v_org_id, v_stop.stop_id, v_stop.customer_id, v_driver_id, p_route_id,
        v_arrived, v_departed,
        extract(epoch from (v_departed - v_arrived))::int,
        v_radius_m, 'geofence_auto'
      )
      on conflict (route_id, stop_id) do nothing;

      -- El cursor avanza a la salida de ESTE stop para no re-contar los
      -- mismos pings al buscar el próximo stop de la secuencia.
      v_cursor_from := v_departed;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------
-- 3. Refresh de agregados por cliente (full recompute — ok a esta escala;
--    si se vuelve lento con volumen, migrar a incremental).
-- ---------------------------------------------
create or replace function public.refresh_customer_service_stats()
returns void
language sql
security definer
set search_path = public
as $$
  insert into customer_service_stats (
    org_id, customer_id, n_samples,
    mean_dwell_seconds, median_dwell_seconds, stddev_dwell_seconds, updated_at
  )
  select
    org_id,
    customer_id,
    count(*),
    avg(dwell_seconds),
    percentile_cont(0.5) within group (order by dwell_seconds),
    coalesce(stddev_samp(dwell_seconds), 0),
    now()
  from stop_visits
  where customer_id is not null
  group by org_id, customer_id
  on conflict (org_id, customer_id) do update set
    n_samples             = excluded.n_samples,
    mean_dwell_seconds     = excluded.mean_dwell_seconds,
    median_dwell_seconds   = excluded.median_dwell_seconds,
    stddev_dwell_seconds   = excluded.stddev_dwell_seconds,
    updated_at            = excluded.updated_at;
$$;

-- ---------------------------------------------
-- 4. Refresh de afinidad de pares de clientes (Fase 4). Sin importar
--    conductor — decisión de producto explícita en PRD 26.
-- ---------------------------------------------
create or replace function public.refresh_customer_pair_affinity()
returns void
language sql
security definer
set search_path = public
as $$
  with route_customers as (
    select distinct r.org_id, r.id as route_id, s.customer_id
      from routes r
      join plan_stops ps on ps.route_id = r.id
      join stops s on s.id = ps.stop_id
     where r.status = 'completed'
       and s.customer_id is not null
  ),
  pairs as (
    select a.org_id, a.route_id,
           least(a.customer_id, b.customer_id) as customer_id_a,
           greatest(a.customer_id, b.customer_id) as customer_id_b
      from route_customers a
      join route_customers b
        on a.route_id = b.route_id
       and a.customer_id < b.customer_id
  )
  insert into customer_pair_affinity (
    org_id, customer_id_a, customer_id_b, co_occurrence_count, updated_at
  )
  select org_id, customer_id_a, customer_id_b, count(distinct route_id), now()
    from pairs
   group by org_id, customer_id_a, customer_id_b
  on conflict (org_id, customer_id_a, customer_id_b) do update set
    co_occurrence_count = excluded.co_occurrence_count,
    updated_at           = excluded.updated_at;
$$;

-- ---------------------------------------------
-- 5. Batch runner: procesa rutas completadas pendientes + refresca agregados.
-- ---------------------------------------------
create or replace function public.run_stop_visits_batch(p_limit int default 200)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route record;
  v_count int := 0;
begin
  for v_route in
    select id from routes
     where status = 'completed'
       and visits_computed_at is null
     order by created_at
     limit p_limit
  loop
    perform public.compute_stop_visits_for_route(v_route.id);
    update routes set visits_computed_at = now() where id = v_route.id;
    v_count := v_count + 1;
  end loop;

  if v_count > 0 then
    perform public.refresh_customer_service_stats();
    perform public.refresh_customer_pair_affinity();
  end if;

  return v_count;
end;
$$;

-- ---------------------------------------------
-- 6. Cron nocturno (mismo patrón idempotente que
--    20260522030000_notification_crons.sql).
-- ---------------------------------------------
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'stop-visits-nightly-batch') then
    perform cron.unschedule('stop-visits-nightly-batch');
  end if;

  perform cron.schedule(
    'stop-visits-nightly-batch',
    '0 7 * * *', -- 07:00 UTC ≈ madrugada Chile, después de la operación del día
    $cron$ select public.run_stop_visits_batch(500); $cron$
  );
end
$$;

comment on function public.compute_stop_visits_for_route is
  'Heurística de geofence secuencial sobre driver_locations. Constantes de radio/umbral fijas — ver PRD 26 Fase 3.';
comment on function public.run_stop_visits_batch is
  'Entry point del cron nocturno. Llamar manualmente con un p_limit chico para probar contra datos reales antes de confiar en las constantes.';
