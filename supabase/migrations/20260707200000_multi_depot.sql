-- =============================================
-- PRD 25 — Multi-Depot (v1 mínimo)
-- =============================================
--
-- Hoy cada org tiene UN depot implícito (organizations.default_depot_*),
-- y cada vehículo puede tener un override ad-hoc (vehicles.depot_lat/lng).
-- Esto agrega `depots` como entidad de primera clase (nombrable,
-- administrable desde Settings) sin romper lo existente:
--
--   - Se crea un depot "Depot principal" por org que ya tenga
--     default_depot_lat/lng seteado (backfill).
--   - `vehicles.depot_id` es un override ADICIONAL — si no se setea,
--     todo sigue funcionando exactamente igual que hoy
--     (vehicles.depot_lat/lng → organizations.default_depot_*).
--   - El wizard de optimización puede pasar un depot_id para la
--     corrida — ver PRD 26/backend-railway/src/routes/vroom.ts.
--
-- Ver docs/25_MULTI_DEPOT.md (versión completa, este PRD implementa un
-- subset: solo §A parcial + UI de Settings + selección en el wizard.
-- Fuera de scope acá: RLS por depot/usuario, DepotSwitcher global,
-- inter-depot transfers, analytics por depot — quedan para cuando haya
-- demanda real de un cliente multi-depot).

create table depots (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  address     text,
  lat         double precision not null,
  lng         double precision not null,
  is_default  boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (org_id, name)
);

create index idx_depots_org on depots(org_id) where is_active;

-- Solo un depot default por org.
create unique index one_default_depot_per_org
  on depots(org_id) where is_default;

alter table depots enable row level security;

create policy "Org members can view depots"
  on depots for select
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Org members can insert depots"
  on depots for insert
  with check (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Org members can update depots"
  on depots for update
  using (public.is_super_admin() or org_id in (select public.user_org_ids()))
  with check (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Org members can delete depots"
  on depots for delete
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

-- Override de depot por vehículo (además del legacy depot_lat/depot_lng).
alter table vehicles
  add column depot_id uuid references depots(id) on delete set null;

-- Backfill: un depot "Depot principal" por org que ya tenga default seteado.
insert into depots (org_id, name, address, lat, lng, is_default)
select id, 'Depot principal', default_depot_address, default_depot_lat, default_depot_lng, true
  from organizations
 where default_depot_lat is not null and default_depot_lng is not null;

comment on table depots is
  'Centros de distribución/depots de una org. v1 mínimo de PRD 25 — sin RLS por depot ni transfers todavía, ver docs/25_MULTI_DEPOT.md.';
comment on column vehicles.depot_id is
  'Override de depot por vehículo (FK a depots). Si es null, cae a vehicles.depot_lat/depot_lng (legacy) y luego a organizations.default_depot_*.';
