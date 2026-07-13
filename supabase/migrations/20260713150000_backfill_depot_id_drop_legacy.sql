-- =============================================
-- PRD 25 — Multi-Depot: cierre de la migración
-- =============================================
--
-- 20260707200000_multi_depot.sql agregó `depots` (v1 mínimo) manteniendo
-- organizations.default_depot_* como fallback para no romper nada mientras
-- el frontend/backend/mobile migraban. Esa migración ya se completó (ver
-- docs/25_MULTI_DEPOT.md): backend (vroom.ts), mobile y las páginas del
-- frontend ahora resuelven el depot exclusivamente vía `vehicles.depot_id` →
-- `depots` o el override legacy `vehicles.depot_lat/lng`. Esta migración:
--
--   1. Backfillea `vehicles.depot_id` con el depot default de su org — pero
--      SOLO para vehículos sin `depot_lat/lng` propio, porque ese override
--      tiene precedencia más alta que `depot_id` en vroom.ts: asignarles
--      igual un `depot_id` les cambiaría el depot resuelto silenciosamente.
--   2. Elimina `get_vehicle_depot()` (helper de 010_depot_locations.sql,
--      sin call sites en la app — dependía de las columnas legacy).
--   3. Elimina organizations.default_depot_lat/lng/address.
--
-- `vehicles.depot_lat/lng` (override legacy por vehículo) se mantiene: sigue
-- siendo un tier válido de la precedencia, no es lo que se está retirando.
--
-- Después de aplicar: regenerar src/data/types/database.ts
-- (`supabase gen types typescript`) — no editar ese archivo a mano.

update vehicles v
set depot_id = d.id
from depots d
where d.org_id = v.org_id
  and d.is_default = true
  and d.is_active = true
  and v.depot_id is null
  and v.depot_lat is null
  and v.depot_lng is null;

drop function if exists get_vehicle_depot(uuid);

alter table organizations
  drop column if exists default_depot_lat,
  drop column if exists default_depot_lng,
  drop column if exists default_depot_address;

comment on column vehicles.depot_id is
  'Override de depot por vehículo (FK a depots). Si es null, cae a vehicles.depot_lat/depot_lng (legacy). Ya no hay fallback a nivel de organización.';
