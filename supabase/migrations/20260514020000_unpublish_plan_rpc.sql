-- RPC atómica para despublicar un plan.
-- El guard NOT EXISTS verifica que ninguna ruta esté in_transit en la misma
-- operación SQL, eliminando la race condition de check-then-update en el cliente.
--
-- Retorna:
--   'ok'             → plan despublicado exitosamente
--   'routes_active'  → hay rutas in_transit, operación bloqueada
--   'not_found'      → plan no existe o no pertenece a la org

create or replace function unpublish_plan(
  p_plan_id uuid,
  p_org_id  uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows_updated int;
begin
  update plans
  set status = 'draft'
  where id = p_plan_id
    and org_id = p_org_id
    and status = 'published'
    and not exists (
      select 1
      from routes
      where plan_id = p_plan_id
        and status = 'in_transit'
    );

  get diagnostics v_rows_updated = row_count;

  if v_rows_updated = 1 then
    return 'ok';
  end if;

  -- Distinguir entre "hay rutas activas" y "plan no encontrado/ya draft"
  if exists (
    select 1 from routes
    where plan_id = p_plan_id and status = 'in_transit'
  ) then
    return 'routes_active';
  end if;

  return 'not_found';
end;
$$;

comment on function unpublish_plan(uuid, uuid) is
  'Despublica un plan si y solo si ninguna ruta está in_transit. Operación atómica.';

grant execute on function unpublish_plan(uuid, uuid) to authenticated;
