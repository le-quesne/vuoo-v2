-- Super-admin: resolver el id de un usuario a partir de su email.
-- Se usa desde la edge function admin-create-org para distinguir entre
-- adjuntar un owner existente vs. invitar uno nuevo.

create or replace function public.admin_lookup_user_id(p_email text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Unauthorized';
  end if;

  if p_email is null or length(trim(p_email)) = 0 then
    return null;
  end if;

  select id into v_id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  return v_id;
end;
$$;

grant execute on function public.admin_lookup_user_id(text) to authenticated;
