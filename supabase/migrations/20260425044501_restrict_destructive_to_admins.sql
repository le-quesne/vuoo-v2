-- =============================================
-- 025: Restringir DELETE a admin/owner
-- =============================================
--
-- Las policies originales en 001_multi_tenant.sql usaban `for all` con
-- `org_id in (select user_org_ids())`. Eso permite a cualquier miembro
-- (driver, member) hacer DELETE/UPDATE/INSERT en plans, routes, stops y
-- vehicles vía la REST API de Supabase saltándose los guards de la UI.
--
-- Esta migration:
--   1. Crea helper `is_org_admin(org_id)` reutilizable.
--   2. Mantiene SELECT/INSERT/UPDATE abiertos a member+ (no rompe drivers
--      marcando entregas, dispatchers creando rutas, etc.).
--   3. Reemplaza la policy `for all` por una `for delete` restringida a
--      admin/owner únicamente.
--
-- Conservadora: solo restringe la operación más destructiva (DELETE).
-- INSERT/UPDATE quedan en una pasada futura cuando se valide caso por
-- caso qué necesitan los drivers (ej. plan_stops UPDATE).

-- ─── Helper ──────────────────────────────────────────────────────────────
create or replace function public.is_org_admin(p_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from organization_members
    where user_id = auth.uid()
      and org_id = p_org_id
      and role in ('owner', 'admin')
  );
$$;

grant execute on function public.is_org_admin(uuid) to authenticated;

-- ─── Vehicles ────────────────────────────────────────────────────────────
drop policy if exists "Org members can manage vehicles" on vehicles;

create policy "Members can read vehicles"
  on vehicles for select
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Members can insert vehicles"
  on vehicles for insert
  with check (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Members can update vehicles"
  on vehicles for update
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Only admins can delete vehicles"
  on vehicles for delete
  using (public.is_super_admin() or public.is_org_admin(org_id));

-- ─── Plans ───────────────────────────────────────────────────────────────
drop policy if exists "Org members can manage plans" on plans;

create policy "Members can read plans"
  on plans for select
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Members can insert plans"
  on plans for insert
  with check (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Members can update plans"
  on plans for update
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Only admins can delete plans"
  on plans for delete
  using (public.is_super_admin() or public.is_org_admin(org_id));

-- ─── Routes ──────────────────────────────────────────────────────────────
drop policy if exists "Org members can manage routes" on routes;

create policy "Members can read routes"
  on routes for select
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Members can insert routes"
  on routes for insert
  with check (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Members can update routes"
  on routes for update
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Only admins can delete routes"
  on routes for delete
  using (public.is_super_admin() or public.is_org_admin(org_id));

-- ─── Stops ───────────────────────────────────────────────────────────────
drop policy if exists "Org members can manage stops" on stops;

create policy "Members can read stops"
  on stops for select
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Members can insert stops"
  on stops for insert
  with check (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Members can update stops"
  on stops for update
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Only admins can delete stops"
  on stops for delete
  using (public.is_super_admin() or public.is_org_admin(org_id));

-- ─── Drivers ─────────────────────────────────────────────────────────────
-- Borrar drivers debe quedar restringido a admin/owner: un driver no puede
-- borrarse a sí mismo ni a otros.
drop policy if exists "Org members can manage drivers" on drivers;

create policy "Members can read drivers"
  on drivers for select
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Members can insert drivers"
  on drivers for insert
  with check (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Members can update drivers"
  on drivers for update
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Only admins can delete drivers"
  on drivers for delete
  using (public.is_super_admin() or public.is_org_admin(org_id));
