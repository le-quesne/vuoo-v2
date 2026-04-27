-- =============================================
-- Driver self-access on routing tables
-- =============================================
--
-- Drivers invited via the `invite-driver` edge function get an `auth.users`
-- row + a `drivers` row (with `user_id`) but are NOT added to
-- `organization_members`. The existing RLS on `routes`, `plans`,
-- `plan_stops`, `stops`, `vehicles` and `organizations` only allows org
-- members through `user_org_ids()`, so the mobile app could not read the
-- routes assigned to a driver — every query returned an empty list.
--
-- This migration adds strict self-access:
--   - SELECT on routing tables limited to rows reachable from a route
--     where `routes.driver_id = (the driver row of auth.uid())`.
--   - UPDATE on `routes` and `plan_stops` for status / POD changes
--     scoped the same way.
--   - SELECT on `organizations` limited to the driver's own `org_id`.
--
-- These policies are ADDITIVE: they do not touch the existing
-- "Members can …" policies that already cover dispatchers / admins.

-- ---------------------------------------------
-- Helper: route ids assigned to the current user as a driver
-- ---------------------------------------------
-- security definer: bypasses RLS internally so the function is safe to
-- call from inside policies without recursion. The function itself
-- filters by `d.user_id = auth.uid()`, so it never leaks foreign rows.
create or replace function public.driver_route_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id
  from public.routes r
  join public.drivers d on d.id = r.driver_id
  where d.user_id = auth.uid();
$$;

revoke all on function public.driver_route_ids() from public;
grant execute on function public.driver_route_ids() to authenticated;

-- ---------------------------------------------
-- routes: driver can read + update own assigned routes
-- ---------------------------------------------
drop policy if exists "Driver can read own routes" on public.routes;
create policy "Driver can read own routes"
  on public.routes for select
  using (
    driver_id in (
      select d.id from public.drivers d where d.user_id = auth.uid()
    )
  );

drop policy if exists "Driver can update own routes" on public.routes;
create policy "Driver can update own routes"
  on public.routes for update
  using (
    driver_id in (
      select d.id from public.drivers d where d.user_id = auth.uid()
    )
  )
  with check (
    -- Driver cannot reassign the route to another driver.
    driver_id in (
      select d.id from public.drivers d where d.user_id = auth.uid()
    )
  );

-- ---------------------------------------------
-- plans: driver can read plans referenced by their assigned routes
-- ---------------------------------------------
drop policy if exists "Driver can read assigned plans" on public.plans;
create policy "Driver can read assigned plans"
  on public.plans for select
  using (
    id in (
      select r.plan_id
      from public.routes r
      join public.drivers d on d.id = r.driver_id
      where d.user_id = auth.uid()
    )
  );

-- ---------------------------------------------
-- plan_stops: driver can read + update stops on their routes (POD)
-- ---------------------------------------------
drop policy if exists "Driver can read own plan_stops" on public.plan_stops;
create policy "Driver can read own plan_stops"
  on public.plan_stops for select
  using (
    route_id in (select public.driver_route_ids())
  );

drop policy if exists "Driver can update own plan_stops" on public.plan_stops;
create policy "Driver can update own plan_stops"
  on public.plan_stops for update
  using (
    route_id in (select public.driver_route_ids())
  )
  with check (
    -- Cannot move a stop to a route the driver does not own.
    route_id in (select public.driver_route_ids())
  );

-- ---------------------------------------------
-- stops (cache): driver can read stops referenced by their plan_stops
-- ---------------------------------------------
drop policy if exists "Driver can read referenced stops" on public.stops;
create policy "Driver can read referenced stops"
  on public.stops for select
  using (
    id in (
      select ps.stop_id
      from public.plan_stops ps
      where ps.stop_id is not null
        and ps.route_id in (select public.driver_route_ids())
    )
  );

-- ---------------------------------------------
-- vehicles: driver can read the vehicle on their assigned routes
-- ---------------------------------------------
drop policy if exists "Driver can read assigned vehicle" on public.vehicles;
create policy "Driver can read assigned vehicle"
  on public.vehicles for select
  using (
    id in (
      select r.vehicle_id
      from public.routes r
      join public.drivers d on d.id = r.driver_id
      where d.user_id = auth.uid()
        and r.vehicle_id is not null
    )
  );

-- ---------------------------------------------
-- organizations: driver can read their own org (depot lookup)
-- ---------------------------------------------
drop policy if exists "Driver can view own organization" on public.organizations;
create policy "Driver can view own organization"
  on public.organizations for select
  using (
    id in (
      select d.org_id from public.drivers d where d.user_id = auth.uid()
    )
  );
