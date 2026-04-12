-- =============================================
-- Vuoo V2 - Field Execution (GPS + POD + Push)
-- =============================================

-- 1. Driver locations (GPS tracking)
-- ---------------------------------------------

create table driver_locations (
  id          uuid primary key default uuid_generate_v4(),
  driver_id   uuid not null references drivers(id) on delete cascade,
  route_id    uuid references routes(id) on delete set null,
  lat         double precision not null,
  lng         double precision not null,
  accuracy    real,
  speed       real,
  heading     real,
  battery     real,
  recorded_at timestamptz not null,
  created_at  timestamptz not null default now()
);

create index idx_driver_locations_driver_time
  on driver_locations(driver_id, recorded_at desc);

create index idx_driver_locations_route
  on driver_locations(route_id, recorded_at desc);

-- 2. Device tokens (push notifications)
-- ---------------------------------------------

create table device_tokens (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  token      text not null,
  platform   text not null default 'android',
  created_at timestamptz not null default now(),
  unique(user_id, token)
);

-- 3. Storage buckets
-- ---------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('delivery-photos', 'delivery-photos', false, 5242880, '{image/jpeg,image/png}'),
  ('signatures',      'signatures',      false, 1048576, '{image/png}')
on conflict (id) do nothing;

-- 4. Row Level Security: driver_locations
-- ---------------------------------------------

alter table driver_locations enable row level security;

create policy "Drivers can insert own locations"
  on driver_locations for insert
  with check (
    driver_id in (
      select d.id from drivers d where d.user_id = auth.uid()
    )
  );

create policy "Org members can view driver locations"
  on driver_locations for select
  using (
    public.is_super_admin()
    or driver_id in (
      select d.id from drivers d where d.org_id in (select public.user_org_ids())
    )
  );

-- 5. Row Level Security: device_tokens
-- ---------------------------------------------

alter table device_tokens enable row level security;

create policy "Users can manage own device tokens"
  on device_tokens for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 6. Storage RLS: delivery-photos & signatures
-- ---------------------------------------------
-- Paths are expected to be prefixed with `{org_id}/...`
-- The first folder segment must be an org the caller belongs to.

create policy "Org members can upload delivery photos"
  on storage.objects for insert
  with check (
    bucket_id = 'delivery-photos'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1]::uuid in (select public.user_org_ids())
    )
  );

create policy "Org members can read delivery photos"
  on storage.objects for select
  using (
    bucket_id = 'delivery-photos'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1]::uuid in (select public.user_org_ids())
    )
  );

create policy "Org members can upload signatures"
  on storage.objects for insert
  with check (
    bucket_id = 'signatures'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1]::uuid in (select public.user_org_ids())
    )
  );

create policy "Org members can read signatures"
  on storage.objects for select
  using (
    bucket_id = 'signatures'
    and (
      public.is_super_admin()
      or (storage.foldername(name))[1]::uuid in (select public.user_org_ids())
    )
  );

-- 7. Realtime on driver_locations
-- ---------------------------------------------

alter publication supabase_realtime add table driver_locations;

-- 8. Cleanup function for old locations (run via cron)
-- ---------------------------------------------

create or replace function public.cleanup_old_locations()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from driver_locations
  where recorded_at < now() - interval '30 days';
end;
$$;
