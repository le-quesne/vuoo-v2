-- =============================================
-- Fix bloqueantes de review PR #38 (país de operación + geocoding)
-- =============================================
--
-- P1: `organizations` nunca tuvo policy UPDATE para owner/admin de la org
-- (solo select/insert/super_admin, ver 001_multi_tenant.sql:140-149). Con
-- RLS, un UPDATE que no matchea ninguna fila NO devuelve error — el cliente
-- veía "Guardado" con éxito falso para cualquier usuario que no fuera
-- super admin, y el valor revertía solo al re-fetchear.
create policy "Org admins can update their org"
  on organizations for update
  using (public.is_super_admin() or public.is_org_admin(id))
  with check (public.is_super_admin() or public.is_org_admin(id));

-- P2: la UI ya impide guardar operating_countries = '{}', pero la DB no lo
-- impedía (solo `not null`, ver 20260707163156). Un `[]` en el path de
-- import (Step3Preview) rompía el join de country con un 400 no-retryable
-- sin pista de la causa. Cinturón y tirantes: si algo más allá de la UI
-- intenta guardar un array vacío, que falle en la DB con un mensaje claro
-- en vez de silenciarse en el cliente.
-- OJO: array_length('{}'::text[], 1) es NULL, no 0 — un CHECK
-- `array_length(...) >= 1` sin coalesce nunca rechaza nada porque
-- `NULL >= 1` es NULL y Postgres deja pasar CHECKs que no den `false`
-- explícito. Verificado localmente antes de aplicar esto a producción.
alter table organizations
  add constraint organizations_operating_countries_not_empty
  check (coalesce(array_length(operating_countries, 1), 0) >= 1);
