-- =============================================
-- Vuoo V2 - Add Drivers (Gestion de Flota)
-- =============================================

-- 1. Create drivers table
-- ---------------------------------------------

create table drivers (
  id                 uuid primary key default uuid_generate_v4(),
  org_id             uuid not null references organizations(id) on delete cascade,
  user_id            uuid references auth.users(id) on delete set null,

  -- Personal data
  first_name         text not null,
  last_name          text not null,
  phone              text,
  email              text,
  avatar_url         text,

  -- Documents
  license_number     text,
  license_expiry     date,
  national_id        text,

  -- Operational
  status             text not null default 'active',
  default_vehicle_id uuid references vehicles(id) on delete set null,

  -- Availability
  time_window_start  time,
  time_window_end    time,
  working_days       integer[] not null default '{1,2,3,4,5}',

  -- Metadata
  notes              text,
  created_at         timestamptz not null default now(),

  constraint drivers_status_check
    check (status in ('active', 'inactive', 'on_leave'))
);

-- 2. Add driver_id to routes
-- ---------------------------------------------

alter table routes
  add column driver_id uuid references drivers(id) on delete set null;

-- 3. Indexes
-- ---------------------------------------------

create index idx_drivers_org_id on drivers(org_id);
create index idx_drivers_default_vehicle on drivers(default_vehicle_id);
create index idx_routes_driver_id on routes(driver_id);

-- 4. Row Level Security
-- ---------------------------------------------

alter table drivers enable row level security;

create policy "Org members can manage drivers"
  on drivers for all
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

-- 5. Update admin_get_org_stats to include driver_count
-- ---------------------------------------------

drop function if exists public.admin_get_org_stats();

create function public.admin_get_org_stats()
returns table(
  org_id uuid,
  org_name text,
  org_slug text,
  org_created_at timestamptz,
  member_count bigint,
  plan_count bigint,
  stop_count bigint,
  vehicle_count bigint,
  route_count bigint,
  driver_count bigint
)
language plpgsql
security definer
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Unauthorized';
  end if;
  return query
    select
      o.id,
      o.name,
      o.slug,
      o.created_at,
      (select count(*) from organization_members om where om.org_id = o.id),
      (select count(*) from plans p where p.org_id = o.id),
      (select count(*) from stops s where s.org_id = o.id),
      (select count(*) from vehicles v where v.org_id = o.id),
      (select count(*) from routes r where r.org_id = o.id),
      (select count(*) from drivers d where d.org_id = o.id)
    from organizations o
    order by o.created_at desc;
end;
$$;
