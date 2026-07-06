-- Super-admin: crear organización desde el panel admin.
-- Genera slug único (a partir del nombre o de un slug provisto), opcionalmente
-- asigna un owner por email, y respeta el flag is_demo.

create or replace function public.admin_create_organization(
  p_name text,
  p_slug text default null,
  p_owner_email text default null,
  p_is_demo boolean default false
)
returns organizations
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  new_org organizations;
  v_base text;
  v_slug text;
  v_owner uuid;
  v_try int := 0;
begin
  if not public.is_super_admin() then
    raise exception 'Unauthorized';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'El nombre de la organización es obligatorio';
  end if;

  -- slug base: del slug provisto o, si no, del nombre
  v_base := trim(both '-' from regexp_replace(lower(coalesce(nullif(trim(p_slug), ''), p_name)), '[^a-z0-9]+', '-', 'g'));
  if v_base is null or v_base = '' then
    v_base := 'org';
  end if;

  -- garantizar unicidad
  v_slug := v_base;
  while exists (select 1 from organizations o where o.slug = v_slug) loop
    v_try := v_try + 1;
    if v_try > 10 then
      raise exception 'No se pudo generar un slug único para "%"', p_name;
    end if;
    v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
  end loop;

  -- resolver owner opcional por email
  if p_owner_email is not null and length(trim(p_owner_email)) > 0 then
    select id into v_owner from auth.users where lower(email) = lower(trim(p_owner_email)) limit 1;
    if v_owner is null then
      raise exception 'No existe un usuario con el email %', trim(p_owner_email);
    end if;
  end if;

  insert into organizations (name, slug, is_demo)
  values (trim(p_name), v_slug, coalesce(p_is_demo, false))
  returning * into new_org;

  if v_owner is not null then
    insert into organization_members (org_id, user_id, role)
    values (new_org.id, v_owner, 'owner');
  end if;

  return new_org;
end;
$$;

grant execute on function public.admin_create_organization(text, text, text, boolean) to authenticated;
