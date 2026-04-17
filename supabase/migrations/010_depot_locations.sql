-- =============================================
-- Depot locations for route optimization
-- =============================================
--
-- Vroom (optimizador VRP) requiere saber desde donde salen y vuelven los
-- vehiculos para calcular rutas optimas. Modelamos dos niveles:
--
--   1) Default por organizacion: una direccion unica para toda la flota.
--      Suficiente si la empresa opera desde una sola bodega.
--
--   2) Override por vehiculo: si algunos vehiculos salen desde un lugar
--      distinto (ej: segunda bodega), se puede definir por vehiculo.
--      Si los campos depot_* del vehiculo son null, usa el default de la org.

alter table organizations
  add column default_depot_lat double precision,
  add column default_depot_lng double precision,
  add column default_depot_address text;

alter table vehicles
  add column depot_lat double precision,
  add column depot_lng double precision,
  add column depot_address text;

-- Helper: resolver depot efectivo para un vehiculo (vehicle override -> org default)
create or replace function get_vehicle_depot(p_vehicle_id uuid)
returns table (lat double precision, lng double precision, address text)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(v.depot_lat, o.default_depot_lat) as lat,
    coalesce(v.depot_lng, o.default_depot_lng) as lng,
    coalesce(v.depot_address, o.default_depot_address) as address
  from vehicles v
  join organizations o on o.id = v.org_id
  where v.id = p_vehicle_id;
$$;

comment on function get_vehicle_depot(uuid) is
  'Resuelve el depot efectivo de un vehiculo: override propio o default de la org.';
