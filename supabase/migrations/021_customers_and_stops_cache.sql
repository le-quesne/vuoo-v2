-- =============================================
-- Flujo pedido → ruta — Fase A (PRD 12)
-- =============================================
--
-- Cimientos del modelo dual:
--   - `customers` (master OPCIONAL de B2B).
--   - `stops` extendida como cache normalizada con confidence / is_curated.
--   - `orders` con flags de calidad de match.
--   - `vehicles` con skills / volume / max_stops (constraints reales para Vroom).
--   - `plan_stops` con items agregables, order_count, required_skills, service_minutes.
--   - `import_templates` reutilizables por org.
--   - `geocoding_cache` compartido por org (privado, no global).
--   - `vuoo_normalize_address()` — normalización idempotente (lower + unaccent +
--     regex) para address_hash y matching fuzzy.
--
-- Ver docs/12_FLUJO_PEDIDO_A_RUTA.md §3 Fase A.

-- ---------------------------------------------
-- 1. Extensiones
-- ---------------------------------------------
create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- ---------------------------------------------
-- 2. Función normalizadora (idempotente + inmutable)
-- ---------------------------------------------
-- Reusada por matching (B.2.1), dedupe de stops (A.2.3) y backfill.
-- IMMUTABLE + set search_path = public, pg_temp para poder usarse en
-- índices funcionales si hiciera falta, sin warning de function_search_path_mutable.
create or replace function public.vuoo_normalize_address(addr text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(
    lower(unaccent(coalesce(addr, ''))),
    '[^a-z0-9 ]', '', 'g'
  );
$$;

-- ---------------------------------------------
-- 3. customers (master OPCIONAL, B2B explícito)
-- ---------------------------------------------
create table customers (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references organizations(id) on delete cascade,
  customer_code               text,
  name                        text not null,
  email                       text,
  phone                       text,
  default_time_window_start   time,
  default_time_window_end     time,
  default_service_minutes     smallint default 5,
  default_required_skills     text[] not null default '{}',
  notes                       text,
  is_active                   boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  -- nullable + unique: el constraint sólo aplica cuando hay code.
  constraint customers_org_code_unique unique (org_id, customer_code)
);

create index idx_customers_org_active on customers(org_id) where is_active;
create index idx_customers_org_name on customers(org_id, lower(name));

alter table customers enable row level security;

create policy "Org members can view customers"
  on customers for select
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Org members can insert customers"
  on customers for insert
  with check (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Org members can update customers"
  on customers for update
  using (public.is_super_admin() or org_id in (select public.user_org_ids()))
  with check (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Org members can delete customers"
  on customers for delete
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

-- Trigger: mantener updated_at fresco (mismo patrón que orders_set_updated_at).
create or replace function public.customers_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_customers_updated_at
  before update on customers
  for each row execute function public.customers_set_updated_at();

-- ---------------------------------------------
-- 4. stops — cache normalizada
-- ---------------------------------------------
alter table stops
  add column if not exists customer_id            uuid references customers(id) on delete set null,
  add column if not exists address_hash           text,
  add column if not exists geocoding_confidence   numeric(3,2),
  add column if not exists geocoding_provider     text,
  add column if not exists is_curated             boolean not null default false,
  add column if not exists priority               smallint default 0,
  add column if not exists required_skills        text[] not null default '{}',
  add column if not exists service_type           text not null default 'delivery',
  add column if not exists last_used_at           timestamptz,
  add column if not exists use_count              integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'stops_priority_range'
  ) then
    alter table stops
      add constraint stops_priority_range check (priority between 0 and 10);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'stops_service_type_valid'
  ) then
    alter table stops
      add constraint stops_service_type_valid check (service_type in ('delivery','pickup','both'));
  end if;
end $$;

create index if not exists idx_stops_org_hash
  on stops(org_id, address_hash);
create index if not exists idx_stops_org_customer
  on stops(org_id, customer_id) where customer_id is not null;
create index if not exists idx_stops_org_curated
  on stops(org_id) where is_curated;
create index if not exists idx_stops_org_skills
  on stops(org_id) where required_skills <> '{}';

-- ---------------------------------------------
-- 5. orders — flags de calidad de match + customer_id
-- ---------------------------------------------
alter table orders
  add column if not exists match_quality         text,
  add column if not exists match_review_needed   boolean not null default false,
  add column if not exists customer_id           uuid references customers(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_match_quality_valid'
  ) then
    alter table orders
      add constraint orders_match_quality_valid
      check (match_quality is null or match_quality in ('high','medium','low','none'));
  end if;
end $$;

create index if not exists idx_orders_review_needed
  on orders(org_id) where match_review_needed;
create index if not exists idx_orders_customer
  on orders(org_id, customer_id) where customer_id is not null;

-- ---------------------------------------------
-- 6. vehicles — skills y capacidades extendidas
-- ---------------------------------------------
alter table vehicles
  add column if not exists skills      text[] not null default '{}',
  add column if not exists volume_m3   numeric(10,3),
  add column if not exists max_stops   integer;

create index if not exists idx_vehicles_org_skills
  on vehicles(org_id) where skills <> '{}';

-- ---------------------------------------------
-- 7. plan_stops — items agregables + constraints reales
-- ---------------------------------------------
-- Fase C (`assign_orders_to_plan`) merge items, suma weight/volume,
-- une skills y cuenta orders. Todas las columnas van con IF NOT EXISTS
-- porque el estado del schema de plan_stops no está versionado en este
-- repo y podría ya traer algunos campos en un entorno más avanzado.
alter table plan_stops
  add column if not exists items              jsonb not null default '[]'::jsonb,
  add column if not exists order_count        integer not null default 1,
  add column if not exists required_skills    text[] not null default '{}',
  add column if not exists service_minutes    smallint not null default 5,
  add column if not exists weight_kg          numeric,
  add column if not exists volume_m3          numeric,
  add column if not exists priority           smallint not null default 0,
  add column if not exists time_window_start  time,
  add column if not exists time_window_end    time;

-- ---------------------------------------------
-- 8. import_templates (reutilizables por org)
-- ---------------------------------------------
create table import_templates (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  name         text not null,
  source       text not null default 'csv',
  column_map   jsonb not null,
  defaults     jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint import_templates_org_name_unique unique (org_id, name),
  constraint import_templates_source_valid check (source in ('csv','xlsx','shopify','vtex','api','whatsapp'))
);

create index idx_import_templates_org on import_templates(org_id);

alter table import_templates enable row level security;

create policy "Org members can view import templates"
  on import_templates for select
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Org members can insert import templates"
  on import_templates for insert
  with check (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Org members can update import templates"
  on import_templates for update
  using (public.is_super_admin() or org_id in (select public.user_org_ids()))
  with check (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Org members can delete import templates"
  on import_templates for delete
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create or replace function public.import_templates_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_import_templates_updated_at
  before update on import_templates
  for each row execute function public.import_templates_set_updated_at();

-- ---------------------------------------------
-- 9. geocoding_cache (compartido por org, NO global)
-- ---------------------------------------------
-- Privacidad: cada org sólo accede a sus propias resoluciones. Rompe el
-- caso ideal de cache global, pero evita filtrar direcciones de un
-- cliente a otro.
create table geocoding_cache (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  address_hash  text not null,
  address_raw   text not null,
  lat           numeric(10,7) not null,
  lng           numeric(10,7) not null,
  confidence    numeric(3,2),
  provider      text not null,
  hit_count     integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint geocoding_cache_org_hash_unique unique (org_id, address_hash),
  constraint geocoding_cache_provider_valid check (provider in ('mapbox','google','manual'))
);

create index idx_geocoding_cache_org_hash on geocoding_cache(org_id, address_hash);

alter table geocoding_cache enable row level security;

create policy "Org members can view geocoding cache"
  on geocoding_cache for select
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Org members can insert geocoding cache"
  on geocoding_cache for insert
  with check (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Org members can update geocoding cache"
  on geocoding_cache for update
  using (public.is_super_admin() or org_id in (select public.user_org_ids()))
  with check (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Org members can delete geocoding cache"
  on geocoding_cache for delete
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create or replace function public.geocoding_cache_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_geocoding_cache_updated_at
  before update on geocoding_cache
  for each row execute function public.geocoding_cache_set_updated_at();

-- ---------------------------------------------
-- 10. Backfill: address_hash en stops existentes
-- ---------------------------------------------
update stops
   set address_hash = public.vuoo_normalize_address(address)
 where address_hash is null;

-- ---------------------------------------------
-- 11. Comentarios de documentación
-- ---------------------------------------------
comment on table customers is
  'Master OPCIONAL de entidades de negocio. Permite modo B2B con autocompletado y matching high. Nullable sin romper flujo B2C.';

comment on column stops.address_hash is
  'vuoo_normalize_address(address). Clave del matching en match_stop_for_order.';

comment on column stops.is_curated is
  'True cuando el operador promueve un stop a "ubicación recurrente". Se usa como tiebreaker prioritario en el matching.';

comment on column orders.match_quality is
  'Calidad del match contra stops: high | medium | low | none. La setea match_stop_for_order durante el import.';

comment on column orders.match_review_needed is
  'True cuando el matching encontró misma address pero distinto customer → UI muestra badge ámbar.';

comment on table import_templates is
  'Mappings CSV persistidos por org. Reusables desde el ImportWizard para importar el mismo formato sin re-mapear columnas.';

comment on table geocoding_cache is
  'Cache privado por org de resoluciones geocoding. Invalidación manual: DELETE. Upsert con hit_count++ en cada hit.';
