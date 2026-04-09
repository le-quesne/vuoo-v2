-- =============================================
-- Create organization with owner RPC
-- =============================================

create or replace function public.create_organization_with_owner(
  p_name text,
  p_slug text
)
returns organizations
language plpgsql
security definer
as $$
declare
  new_org organizations;
begin
  insert into organizations (name, slug)
  values (p_name, p_slug)
  returning * into new_org;

  insert into organization_members (org_id, user_id, role)
  values (new_org.id, auth.uid(), 'owner');

  return new_org;
end;
$$;
