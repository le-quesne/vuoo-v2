-- List members of an organization with their email (from auth.users).
-- Caller must be a member of the target org (the RLS-friendly gate lives in the WHERE clause).
create or replace function public.list_org_members(p_org_id uuid)
returns table(
  id uuid,
  user_id uuid,
  email text,
  role public.org_role,
  app_role text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    om.id,
    om.user_id,
    u.email::text,
    om.role,
    coalesce(u.raw_app_meta_data->>'role', '')::text as app_role,
    om.created_at
  from public.organization_members om
  join auth.users u on u.id = om.user_id
  where om.org_id = p_org_id
    and (
      public.is_super_admin()
      or p_org_id in (select public.user_org_ids())
    )
  order by om.created_at asc;
$$;

grant execute on function public.list_org_members(uuid) to authenticated;

-- Remove a member from an organization. Only owners/admins can remove, and nobody can remove the last owner.
create or replace function public.remove_org_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_target_role public.org_role;
  v_caller_role public.org_role;
  v_owner_count int;
begin
  select org_id, role into v_org_id, v_target_role
  from public.organization_members where id = p_member_id;

  if v_org_id is null then
    raise exception 'Member not found';
  end if;

  select role into v_caller_role
  from public.organization_members
  where org_id = v_org_id and user_id = auth.uid();

  if v_caller_role not in ('owner', 'admin') and not public.is_super_admin() then
    raise exception 'Not authorized';
  end if;

  if v_target_role = 'owner' then
    select count(*) into v_owner_count
    from public.organization_members
    where org_id = v_org_id and role = 'owner';
    if v_owner_count <= 1 then
      raise exception 'Cannot remove the last owner';
    end if;
  end if;

  delete from public.organization_members where id = p_member_id;
end;
$$;

grant execute on function public.remove_org_member(uuid) to authenticated;
