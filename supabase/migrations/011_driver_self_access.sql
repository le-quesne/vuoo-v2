-- =============================================
-- Vuoo V2 - Driver self-access on drivers table
-- =============================================
--
-- Drivers created via the invite-driver edge function get an auth.users row
-- but are NOT added to organization_members. The pre-existing policy on
-- `drivers` ("Org members can manage drivers") relies on user_org_ids(), so
-- without these policies a driver cannot read or update their own profile
-- row from the mobile app.
--
-- Scope is strict: self-SELECT and self-UPDATE only, and the driver cannot
-- change their `org_id` or `user_id` (we block this at the column level by
-- never allowing the driver's client to pass those fields; Postgres RLS
-- does not gate per-column updates on its own, but the UI and `is_super_admin`
-- checks on org_id below keep identity tampering contained).

create policy "Driver can read own row"
  on drivers for select
  using (user_id = auth.uid());

create policy "Driver can update own row"
  on drivers for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    -- If the driver tries to hop orgs, require super admin. Prevents a
    -- driver from reassigning themselves to another org via a crafted update.
    and (
      org_id = (select org_id from drivers where user_id = auth.uid() limit 1)
      or public.is_super_admin()
    )
  );
