-- =============================================
-- Vuoo V2 - Multi-Tenant Migration
-- =============================================

-- 1A. New tables
-- ---------------------------------------------

create table organizations (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text unique not null,
  created_at timestamptz not null default now()
);

alter table organizations enable row level security;

create type org_role as enum ('owner', 'admin', 'member');

create table organization_members (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid references organizations(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role org_role not null default 'member',
  created_at timestamptz not null default now(),
  unique(org_id, user_id)
);

alter table organization_members enable row level security;

create index idx_org_members_user on organization_members(user_id);
create index idx_org_members_org on organization_members(org_id);

-- 1B. Add org_id to existing tables
-- ---------------------------------------------

alter table vehicles add column org_id uuid references organizations(id) on delete cascade;
alter table plans add column org_id uuid references organizations(id) on delete cascade;
alter table routes add column org_id uuid references organizations(id) on delete cascade;
alter table stops add column org_id uuid references organizations(id) on delete cascade;

create index idx_vehicles_org on vehicles(org_id);
create index idx_plans_org_date on plans(org_id, date);
create index idx_routes_org on routes(org_id);
create index idx_stops_org on stops(org_id);

-- 1C. Helper functions
-- ---------------------------------------------

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select raw_app_meta_data->>'is_super_admin' = 'true'
     from auth.users
     where id = auth.uid()),
    false
  );
$$;

create or replace function public.user_org_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select org_id from organization_members where user_id = auth.uid();
$$;

-- Admin RPC: list all users (super admin only)
create or replace function public.admin_list_users()
returns table(id uuid, email text, created_at timestamptz, is_super_admin boolean, org_count bigint)
language plpgsql
security definer
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Unauthorized';
  end if;
  return query
    select
      u.id,
      u.email::text,
      u.created_at,
      coalesce((u.raw_app_meta_data->>'is_super_admin')::boolean, false),
      (select count(*) from organization_members om where om.user_id = u.id)
    from auth.users u
    order by u.created_at desc;
end;
$$;

-- Admin RPC: get org stats (super admin only)
create or replace function public.admin_get_org_stats()
returns table(
  org_id uuid,
  org_name text,
  org_slug text,
  org_created_at timestamptz,
  member_count bigint,
  plan_count bigint,
  stop_count bigint,
  vehicle_count bigint,
  route_count bigint
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
      (select count(*) from routes r where r.org_id = o.id)
    from organizations o
    order by o.created_at desc;
end;
$$;

-- 1D. Drop old policies, create new ones
-- ---------------------------------------------

drop policy if exists "Users can manage own vehicles" on vehicles;
drop policy if exists "Users can manage own plans" on plans;
drop policy if exists "Users can manage own routes" on routes;
drop policy if exists "Users can manage own stops" on stops;

-- Organizations policies
create policy "Members can view their orgs"
  on organizations for select
  using (public.is_super_admin() or id in (select public.user_org_ids()));

create policy "Super admins can manage all orgs"
  on organizations for all
  using (public.is_super_admin());

create policy "Authenticated users can create orgs"
  on organizations for insert
  with check (auth.uid() is not null);

-- Organization members policies
create policy "Members can view org members"
  on organization_members for select
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

create policy "Super admins can manage all memberships"
  on organization_members for all
  using (public.is_super_admin());

create policy "Users can create their own membership"
  on organization_members for insert
  with check (user_id = auth.uid());

-- Vehicles
create policy "Org members can manage vehicles"
  on vehicles for all
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

-- Plans
create policy "Org members can manage plans"
  on plans for all
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

-- Routes
create policy "Org members can manage routes"
  on routes for all
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

-- Stops
create policy "Org members can manage stops"
  on stops for all
  using (public.is_super_admin() or org_id in (select public.user_org_ids()));

-- 1E. Backfill existing data
-- ---------------------------------------------

do $$
declare
  u record;
  new_org_id uuid;
begin
  for u in (select distinct id, email from auth.users) loop
    insert into organizations (name, slug)
    values (
      coalesce(split_part(u.email, '@', 1), 'My Organization'),
      replace(u.id::text, '-', '')
    )
    returning id into new_org_id;

    insert into organization_members (org_id, user_id, role)
    values (new_org_id, u.id, 'owner');

    update vehicles set org_id = new_org_id where user_id = u.id;
    update plans set org_id = new_org_id where user_id = u.id;
    update routes set org_id = new_org_id where user_id = u.id;
    update stops set org_id = new_org_id where user_id = u.id;
  end loop;
end $$;

-- Make org_id NOT NULL after backfill
alter table vehicles alter column org_id set not null;
alter table plans alter column org_id set not null;
alter table routes alter column org_id set not null;
alter table stops alter column org_id set not null;
