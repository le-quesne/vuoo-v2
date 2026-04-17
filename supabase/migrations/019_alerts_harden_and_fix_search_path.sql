-- =============================================
-- Hardening post-migration 018
-- =============================================
--
-- 1. Fijamos search_path en drivers_touch_availability (lint
--    0011_function_search_path_mutable).
-- 2. Cerramos la policy INSERT de `alerts` que quedó como
--    `with check (true)`. Los triggers que crean alerts usan
--    SECURITY DEFINER y bypassean RLS, así que no necesitan una
--    policy abierta — sólo los inserts manuales desde clientes
--    autenticados están bloqueados si el org no coincide.

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

drop policy if exists "System can insert alerts" on alerts;

create policy "Org members can insert alerts"
  on alerts for insert
  with check (public.is_super_admin() or org_id in (select public.user_org_ids()));
