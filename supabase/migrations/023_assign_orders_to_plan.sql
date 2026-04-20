-- =============================================
-- Flujo pedido → ruta — Fase C + A.2.3 (PRD 12)
-- =============================================
--
-- Tres RPCs server-side que reemplazan loops secuenciales del cliente:
--
--   assign_orders_to_plan(order_ids, plan_id, allow_override)
--     → crea o fusiona plan_stops en el plan, uno por grupo (stop_id +
--       ventanas solapadas). Atómico, 1 round-trip.
--
--   unassign_orders_from_plan(order_ids, plan_id)
--     → suelta órdenes del plan; elimina plan_stops que queden sin
--       órdenes referenciadas.
--
--   merge_stops(loser_id, winner_id)
--     → fusiona dos stops duplicados. Rewire de orders y plan_stops,
--       mezcla use_count / required_skills / is_curated, copia campos
--       blandos (notes, skills) al winner si son null, DELETE del loser.
--
-- Todas SECURITY DEFINER para bypass RLS controlado; validan org_id
-- match antes de tocar nada.

-- ---------------------------------------------
-- 1. assign_orders_to_plan
-- ---------------------------------------------
create or replace function public.assign_orders_to_plan(
  p_order_ids       uuid[],
  p_plan_id         uuid,
  p_allow_override  boolean default false
) returns table (
  order_id       uuid,
  stop_id        uuid,
  plan_stop_id   uuid,
  action         text,
  match_quality  text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id              uuid;
  v_order               record;
  v_existing_plan_stop  uuid;
begin
  select org_id into v_org_id from plans where id = p_plan_id;
  if v_org_id is null then
    raise exception 'plan_not_found: %', p_plan_id;
  end if;

  for v_order in
    select o.* from orders o
     where o.id = any(p_order_ids)
       and o.org_id = v_org_id
  loop
    -- Skip si ya está asignada y no se forzó override.
    if v_order.plan_stop_id is not null and not p_allow_override then
      order_id      := v_order.id;
      stop_id       := v_order.stop_id;
      plan_stop_id  := v_order.plan_stop_id;
      action        := 'skipped_already_assigned';
      match_quality := v_order.match_quality;
      return next;
      continue;
    end if;

    -- Toda orden en esta fase debe traer stop_id (Fase B lo garantiza).
    if v_order.stop_id is null then
      raise exception 'order_without_stop: %', v_order.id;
    end if;

    -- Buscar plan_stop existente en este plan con mismo stop_id y
    -- ventana compatible (solapadas o ambas null).
    select ps.id into v_existing_plan_stop
      from plan_stops ps
     where ps.plan_id = p_plan_id
       and ps.stop_id = v_order.stop_id
       and (
         (ps.time_window_start is null and v_order.time_window_start is null)
         or (
           ps.time_window_start is not null
           and v_order.time_window_start is not null
           and tstzrange(
                 (current_date + ps.time_window_start)::timestamptz,
                 (current_date + coalesce(ps.time_window_end, ps.time_window_start))::timestamptz,
                 '[]'
               )
               && tstzrange(
                 (current_date + v_order.time_window_start)::timestamptz,
                 (current_date + coalesce(v_order.time_window_end, v_order.time_window_start))::timestamptz,
                 '[]'
               )
         )
       )
     limit 1;

    if v_existing_plan_stop is not null then
      -- Merge: items concatenados, pesos sumados, skills unidas
      -- (plan_stop ∪ stop.required_skills), priority max con la del stop.
      update plan_stops ps set
        items           = ps.items || v_order.items,
        weight_kg       = coalesce(ps.weight_kg, 0) + coalesce(v_order.total_weight_kg, 0),
        volume_m3       = coalesce(ps.volume_m3, 0) + coalesce(v_order.total_volume_m3, 0),
        required_skills = coalesce(
                            (select array_agg(distinct s)
                               from unnest(
                                 coalesce(ps.required_skills, '{}'::text[])
                                 || coalesce(
                                      (select s2.required_skills
                                         from stops s2
                                        where s2.id = v_order.stop_id),
                                      '{}'::text[]
                                    )
                               ) s),
                            '{}'::text[]
                          ),
        priority        = greatest(
                            ps.priority,
                            coalesce((select s3.priority from stops s3 where s3.id = v_order.stop_id), 0)
                          ),
        order_count     = ps.order_count + 1
       where ps.id = v_existing_plan_stop;

      update orders set plan_stop_id = v_existing_plan_stop
       where id = v_order.id;

      order_id      := v_order.id;
      stop_id       := v_order.stop_id;
      plan_stop_id  := v_existing_plan_stop;
      action        := 'merged_existing';
      match_quality := v_order.match_quality;
      return next;
    else
      -- Crear plan_stop nuevo, heredando datos del order y del stop
      -- (skills + priority vienen del stop, que es la fuente canónica).
      insert into plan_stops (
        plan_id, stop_id, org_id,
        items, weight_kg, volume_m3,
        required_skills, priority,
        time_window_start, time_window_end,
        service_minutes, order_count
      )
      select
        p_plan_id, v_order.stop_id, v_org_id,
        v_order.items,
        v_order.total_weight_kg,
        v_order.total_volume_m3,
        coalesce(s.required_skills, '{}'::text[]),
        coalesce(s.priority, 0),
        v_order.time_window_start, v_order.time_window_end,
        coalesce(v_order.service_duration_minutes, 5),
        1
      from stops s
      where s.id = v_order.stop_id
      returning id into v_existing_plan_stop;

      update orders set plan_stop_id = v_existing_plan_stop
       where id = v_order.id;

      order_id      := v_order.id;
      stop_id       := v_order.stop_id;
      plan_stop_id  := v_existing_plan_stop;
      action        := 'created_new';
      match_quality := v_order.match_quality;
      return next;
    end if;
  end loop;

  -- Refresh stats en stops tocados (cache de uso).
  update stops s set
    last_used_at = now(),
    use_count    = s.use_count + coalesce(sub.cnt, 0)
    from (
      select o.stop_id, count(*)::integer as cnt
        from orders o
       where o.id = any(p_order_ids)
         and o.stop_id is not null
       group by o.stop_id
    ) sub
   where s.id = sub.stop_id;
end;
$$;

grant execute on function public.assign_orders_to_plan(uuid[], uuid, boolean)
  to authenticated;

comment on function public.assign_orders_to_plan(uuid[], uuid, boolean) is
  'Agrupa órdenes en plan_stops por (stop_id + ventana). Merge o create. Atómico, 1 round-trip. See PRD 12 Fase C.';

-- ---------------------------------------------
-- 2. unassign_orders_from_plan
-- ---------------------------------------------
create or replace function public.unassign_orders_from_plan(
  p_order_ids  uuid[],
  p_plan_id    uuid
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  update orders
     set plan_stop_id = null
   where id = any(p_order_ids)
     and plan_stop_id in (
       select id from plan_stops where plan_id = p_plan_id
     );
  get diagnostics v_count = row_count;

  -- Limpiar plan_stops huérfanos (sin orders ni otros motivos de permanencia).
  delete from plan_stops ps
   where ps.plan_id = p_plan_id
     and not exists (
       select 1 from orders o where o.plan_stop_id = ps.id
     );

  return v_count;
end;
$$;

grant execute on function public.unassign_orders_from_plan(uuid[], uuid)
  to authenticated;

comment on function public.unassign_orders_from_plan(uuid[], uuid) is
  'Deshace assign_orders_to_plan. Limpia plan_stops que quedan sin orders referenciadas.';

-- ---------------------------------------------
-- 3. merge_stops (A.2.3)
-- ---------------------------------------------
-- Fusiona dos stops duplicados. Winner sobrevive, loser desaparece.
-- Rewire total de orders y plan_stops, mezcla datos blandos, DELETE.
-- Atómico: si algo falla, la transacción completa se revierte.
create or replace function public.merge_stops(
  p_loser_id   uuid,
  p_winner_id  uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loser   stops%rowtype;
  v_winner  stops%rowtype;
begin
  if p_loser_id = p_winner_id then
    raise exception 'merge_stops: loser and winner are the same (%)', p_loser_id;
  end if;

  select * into v_loser  from stops where id = p_loser_id  for update;
  select * into v_winner from stops where id = p_winner_id for update;

  if v_loser.id is null then
    raise exception 'merge_stops: loser not found (%)', p_loser_id;
  end if;
  if v_winner.id is null then
    raise exception 'merge_stops: winner not found (%)', p_winner_id;
  end if;
  if v_loser.org_id <> v_winner.org_id then
    raise exception 'merge_stops: cross-org merge blocked (% vs %)',
      v_loser.org_id, v_winner.org_id;
  end if;

  -- Rewire de referencias.
  update orders     set stop_id = v_winner.id where stop_id = v_loser.id;
  update plan_stops set stop_id = v_winner.id where stop_id = v_loser.id;

  -- Mezcla de campos: sumar uso, unir skills, OR sobre is_curated.
  update stops set
    use_count       = v_winner.use_count + coalesce(v_loser.use_count, 0),
    is_curated      = v_winner.is_curated or v_loser.is_curated,
    required_skills = coalesce(
                        (select array_agg(distinct s)
                           from unnest(
                             coalesce(v_winner.required_skills, '{}'::text[])
                             || coalesce(v_loser.required_skills, '{}'::text[])
                           ) s),
                        '{}'::text[]
                      ),
    last_used_at    = greatest(
                        coalesce(v_winner.last_used_at, '-infinity'::timestamptz),
                        coalesce(v_loser.last_used_at,  '-infinity'::timestamptz)
                      ),
    -- Campos "blandos": solo copiar desde loser si winner los tiene null.
    customer_name         = coalesce(v_winner.customer_name, v_loser.customer_name),
    customer_phone        = coalesce(v_winner.customer_phone, v_loser.customer_phone),
    customer_email        = coalesce(v_winner.customer_email, v_loser.customer_email),
    delivery_instructions = coalesce(v_winner.delivery_instructions, v_loser.delivery_instructions),
    customer_id           = coalesce(v_winner.customer_id, v_loser.customer_id),
    geocoding_confidence  = coalesce(v_winner.geocoding_confidence, v_loser.geocoding_confidence),
    geocoding_provider    = coalesce(v_winner.geocoding_provider, v_loser.geocoding_provider)
  where id = v_winner.id;

  -- Finalmente, borrar al loser.
  delete from stops where id = v_loser.id;
end;
$$;

grant execute on function public.merge_stops(uuid, uuid) to authenticated;

comment on function public.merge_stops(uuid, uuid) is
  'Fusiona dos stops duplicados. Winner sobrevive. Atómico. PRD 12 Fase A.2.3.';
